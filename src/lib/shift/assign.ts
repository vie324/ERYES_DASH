// シフト自動割当（貪欲法）と割当ボードの警告計算。
// 思想：自動割当はあくまで「下書き」。ルールを満たせない箇所は警告として出し、
// 最終判断は管理者の手動調整に委ねる（無理な最適化はしない）。

import { addDays, datesOfMonth, weekdayOf } from "@/lib/date";
import type {
  JobType,
  NewShiftAssignment,
  ShiftAssignment,
  ShiftPreference,
  ShiftRules,
} from "@/lib/data/types";

export interface AssignContext {
  targetMonth: string;
  storeIds: string[]; // 配置対象の店舗（全店舗）
  staffIds: string[]; // 割当候補のスタッフ（在籍中）
  /** staffId → 日付 → 希望。行が無い日は「指定なし＝早遅どちらでも可」 */
  prefs: Map<string, Map<string, ShiftPreference>>;
  /** staffId → その月に勤務可能な店舗。未提出のスタッフはキー自体が無く、割当対象外になる */
  availableStores: Map<string, Set<string>>;
  rules: ShiftRules;
  /** 前月の割当日（staffId → 日付集合）。月またぎの連勤判定に使う */
  prevMonthAssignedDates: Map<string, Set<string>>;
  /** staffId → 職種。スタイリストを日ごとに散らすために使う（未指定は "" 扱い） */
  jobTypes?: Map<string, JobType>;
  /** staffId → 段数。土日に休みを出すときは1段の人から優先する（未指定は1段） */
  tiers?: Map<string, number>;
  /** 全員参加イベントの日（しもん塾・全体会議など）。なるべく全員を出勤にする */
  allHandsDates?: Set<string>;
}

/**
 * 自動割当の重みづけ。「どれを優先するか」をここに集約しておき、
 * 運用に合わなければこの数字だけを触れば挙動が変わるようにする。
 */
export const ASSIGN_WEIGHTS = {
  /** 当月の割当が少ない人を優先（公平性）。1件あたりの重み */
  fairness: 10,
  /**
   * その店舗にまだスタイリストがいないとき、スタイリストを優先する。
   * 段数1つぶんの weekendReserve より大きくして、
   * 「土日に備えて休ませたい人」であっても、その日の店舗にスタイリストがいなければ入れる。
   */
  stylistNeeded: 80,
  /** その店舗にスタイリストが足りているとき、さらに足すのを抑える */
  stylistExcess: 40,
  /** 残りのスタイリストが後ろの店舗ぶんしかないときは、次の店舗へ回す（強く抑える） */
  stylistHold: 200,
  /** 土日：段数の多い人を残す（1段の人から休みにする）。1段あたりの重み */
  weekendTier: 25,
  /**
   * 平日：今ここで入れると、次の土日・全員参加イベントに連勤上限で入れなくなる人を後回しにする。
   * 段数を掛けるので、段数の多い人ほど平日に休んでもらい、土日の戦力を残す。
   * 段数1つぶんの差（weekendReserve）がスタイリストの分散（stylistNeeded）を上回るようにして、
   * 「土日に残すのは段数の多い人／休みにするのは1段の人」が実際に効くようにしている。
   */
  weekendReserve: 70,
} as const;

/** 土日か（0=日・6=土） */
function isWeekend(date: string): boolean {
  const wd = weekdayOf(date);
  return wd === 0 || wd === 6;
}

/**
 * その日から先を見て、直近の「なるべく全員に出てほしい日」（土日・全員参加イベント）が
 * 終わるまでの日数を返す。連続している分（土＋日、イベントが土日に続く場合など）はまとめて数える。
 * 見つからなければ 0。
 */
function daysThroughNextPriority(date: string, priority: (d: string) => boolean): number {
  for (let i = 1; i <= 7; i++) {
    if (!priority(addDays(date, i))) continue;
    let end = i;
    while (end < 14 && priority(addDays(date, end + 1))) end++;
    return end;
  }
  return 0;
}

export interface CoverageWarning {
  date: string;
  storeId: string;
  assigned: number;
  required: number;
}

/** date を追加したときに連勤上限を超えないか（過去方向の連続日数を数える） */
function runLengthBefore(assigned: Set<string>, date: string): number {
  let run = 0;
  let d = addDays(date, -1);
  while (assigned.has(d)) {
    run++;
    d = addDays(d, -1);
  }
  return run;
}

/**
 * 自動割当の本体。日付→店舗の順に、勤務可能なスタッフを埋めていく。
 * 「誰から入れるか」は次の考え方で決める（重みは ASSIGN_WEIGHTS）：
 *   ・公平性 …… 当月の割当が少ない人から
 *   ・スタイリストの分散 …… その日にスタイリストがいない店舗にはスタイリストを優先、
 *     すでに足りていれば別の人を先に入れる（特定の日・店舗にスタイリストが固まらないように）
 *   ・土日 …… なるべく全員出勤。人を絞るときは段数の多い人を残し、1段の人から休みにする
 *   ・全員参加イベント（しもん塾・全体会議など） …… その日は出られる人を全員入れる
 *   ・平日 …… その日入れると土日が連勤上限に当たってしまう人は後回しにして、土日の出勤を守る
 *
 * この4つはぶつかることがある（例：スタイリストが少ないと、店舗のカバーを優先した結果
 * そのスタイリストが土日に連勤上限で入れなくなる）。そのときは
 *   「各店舗にスタイリストがいること」＞「土日に段数の多い人を残すこと」
 * の順で効くように重みを決めている（stylistNeeded > weekendReserve × 1段）。
 * 最低人数に届かない店舗・日は警告として返す（自動割当はあくまで下書き）。
 */
export function generateAssignments(ctx: AssignContext): {
  assignments: NewShiftAssignment[];
  warnings: CoverageWarning[];
} {
  const dates = datesOfMonth(ctx.targetMonth);
  const assignments: NewShiftAssignment[] = [];
  const warnings: CoverageWarning[] = [];

  const jobTypeOf = (staffId: string) => ctx.jobTypes?.get(staffId) ?? "";
  const tierOf = (staffId: string) => Math.max(1, ctx.tiers?.get(staffId) ?? 1);
  const isStylist = (staffId: string) => jobTypeOf(staffId) === "stylist";

  // 連勤判定用の割当済み日付（前月分を持ち越し）
  const assignedDates = new Map<string, Set<string>>();
  // 公平性：当月の割当数が少ない人を優先
  const assignedCount = new Map<string, number>();
  for (const s of ctx.staffIds) {
    assignedDates.set(s, new Set(ctx.prevMonthAssignedDates.get(s) ?? []));
    assignedCount.set(s, 0);
  }

  /** なるべく全員に出てほしい日（土日・しもん塾や全体会議などの全員参加イベント） */
  const isPriorityDay = (d: string) => isWeekend(d) || (ctx.allHandsDates?.has(d) ?? false);

  // スタイリストは「1日1店舗に最低1人」を目安に散らす（人数が足りなければ目安を下げる）
  const stylistTotal = ctx.staffIds.filter(isStylist).length;
  const stylistTargetPerStore =
    ctx.storeIds.length > 0 && stylistTotal > 0
      ? Math.max(1, Math.floor(stylistTotal / Math.max(1, ctx.storeIds.length)))
      : 0;

  dates.forEach((date, dayIndex) => {
    // 店舗の処理順を日ごとにローテーションし、人手不足が特定店舗に偏らないようにする
    const storeOrder = ctx.storeIds.map(
      (_, i) => ctx.storeIds[(i + dayIndex) % ctx.storeIds.length]
    );
    const assignedToday = new Set<string>(); // この日すでにどこかの店舗に入った人
    const weekend = isWeekend(date);
    const allHands = ctx.allHandsDates?.has(date) ?? false;
    const priorityDay = weekend || allHands;
    // 平日：次の「全員出したい日」を最後まで出勤できるかを見て、必要ならこの日を休みにしておく
    const throughPriority = priorityDay ? 0 : daysThroughNextPriority(date, isPriorityDay);

    storeOrder.forEach((storeId, storeIndex) => {
      const required = ctx.rules.minStaffPerStoreDay;
      const remainingStores = storeOrder.length - storeIndex;
      const storesAfter = remainingStores - 1;
      const earlyLateCount = { early: 0, late: 0 };
      let stylistsHere = 0;

      const candidates = ctx.staffIds.filter((staffId) => {
        if (assignedToday.has(staffId)) return false;
        if (!ctx.availableStores.get(staffId)?.has(storeId)) return false; // 勤務可能店舗のみ
        if (ctx.prefs.get(staffId)?.get(date) === "off") return false; // 休み希望日は割り当てない
        // 連勤上限：この日を足して上限を超えるなら不可
        return runLengthBefore(assignedDates.get(staffId)!, date) < ctx.rules.maxConsecutiveDays;
      });

      /** この日ここで入れると、次の土日・全員参加イベントに入れなくなるか */
      const blocksPriority = (staffId: string): boolean => {
        if (throughPriority === 0) return false;
        const runAfter = runLengthBefore(assignedDates.get(staffId)!, date) + 1;
        return runAfter + throughPriority > ctx.rules.maxConsecutiveDays;
      };

      /** 高いほど先に入れる。同点は候補リスト順で安定させる */
      const scoreOf = (staffId: string, stylistsSoFar: number, stylistsLeft: number): number => {
        let score = -assignedCount.get(staffId)! * ASSIGN_WEIGHTS.fairness;

        // スタイリストの分散：この店舗にまだいなければ優先、足りていれば抑える。
        // さらに、残りのスタイリストが後ろの店舗ぶんしかないなら、次の店舗へ回すよう強く抑える。
        if (isStylist(staffId)) {
          if (stylistsSoFar < stylistTargetPerStore) {
            score += ASSIGN_WEIGHTS.stylistNeeded;
          } else {
            score -= ASSIGN_WEIGHTS.stylistExcess;
            if (stylistsLeft <= storesAfter) score -= ASSIGN_WEIGHTS.stylistHold;
          }
        }

        if (weekend) {
          // 土日は段数の多い人を残す＝1段の人から休みになる
          score += (tierOf(staffId) - 1) * ASSIGN_WEIGHTS.weekendTier;
        } else if (blocksPriority(staffId)) {
          // 平日：ここで入れると土日・全員参加イベントに続けて出られなくなる人は後回しにする。
          // 段数が多い人ほど強く後回しにして、平日に休んでもらい、土日の戦力を確保する。
          score -= ASSIGN_WEIGHTS.weekendReserve * tierOf(staffId);
        }
        return score;
      };

      // 全員参加イベントの日と土日は、出られる人を全員入れる（なるべく出勤）。
      // ただし1店舗に全員を寄せてしまわないよう、残りの店舗数で割って均等に配る。
      const target = priorityDay
        ? Math.max(required, Math.ceil(candidates.length / remainingStores))
        : required;

      const remaining = [...candidates];
      const picked: string[] = [];
      /** pool の中で一番スコアの高い人（同点は候補リスト順で安定） */
      const pickBest = (pool: string[], stylistsLeft: number): string => {
        let best = pool[0];
        let bestScore = scoreOf(best, stylistsHere, stylistsLeft);
        for (let i = 1; i < pool.length; i++) {
          const score = scoreOf(pool[i], stylistsHere, stylistsLeft);
          if (score > bestScore) {
            bestScore = score;
            best = pool[i];
          }
        }
        return best;
      };

      while (picked.length < target && remaining.length > 0) {
        // スタイリストの充足状況は1人選ぶたびに変わるので、その都度スコアを出し直す
        const best = pickBest(remaining, remaining.filter(isStylist).length);
        remaining.splice(remaining.indexOf(best), 1);
        picked.push(best);
        if (isStylist(best)) stylistsHere++;
      }

      for (const staffId of picked) {
        const pref = ctx.prefs.get(staffId)?.get(date);
        // 早番・遅番の希望があれば尊重し、指定なしなら少ない側に入れてバランスを取る
        const shiftType =
          pref === "early" || pref === "late"
            ? pref
            : earlyLateCount.early <= earlyLateCount.late
              ? "early"
              : "late";
        earlyLateCount[shiftType]++;
        assignments.push({ date, staffId, storeId, shiftType });
        assignedToday.add(staffId);
        assignedDates.get(staffId)!.add(date);
        assignedCount.set(staffId, assignedCount.get(staffId)! + 1);
      }

      if (picked.length < required) {
        warnings.push({ date, storeId, assigned: picked.length, required });
      }
    });
  });

  return { assignments, warnings };
}

// ---- 割当ボードの警告計算（自動・手動を問わず現在の割当全体を検査する） ----

export interface BoardWarnings {
  /** 最低人数に届かない 店舗×日 */
  coverage: CoverageWarning[];
  /** 休み希望の日に割り当てられている */
  offConflicts: { date: string; staffId: string }[];
  /** 勤務可能店舗以外（または希望未提出者）への割当 */
  storeConflicts: { date: string; staffId: string; storeId: string }[];
  /** 連勤上限の超過（連続区間ごと） */
  consecutive: { staffId: string; from: string; to: string; length: number }[];
}

export function computeBoardWarnings(
  targetMonth: string,
  assignments: ShiftAssignment[],
  ctx: Pick<AssignContext, "storeIds" | "prefs" | "availableStores" | "rules"> & {
    prevMonthAssignedDates: Map<string, Set<string>>;
  }
): BoardWarnings {
  const dates = datesOfMonth(targetMonth);
  const warnings: BoardWarnings = {
    coverage: [],
    offConflicts: [],
    storeConflicts: [],
    consecutive: [],
  };

  // 人数チェック（店舗×日）
  const countByStoreDate = new Map<string, number>();
  for (const a of assignments) {
    const key = `${a.date}|${a.storeId}`;
    countByStoreDate.set(key, (countByStoreDate.get(key) ?? 0) + 1);
  }
  for (const date of dates) {
    for (const storeId of ctx.storeIds) {
      const assigned = countByStoreDate.get(`${date}|${storeId}`) ?? 0;
      if (assigned < ctx.rules.minStaffPerStoreDay) {
        warnings.coverage.push({
          date,
          storeId,
          assigned,
          required: ctx.rules.minStaffPerStoreDay,
        });
      }
    }
  }

  // 休み希望・店舗外への割当（手動調整で起こり得る。ブロックはせず警告表示のみ）
  for (const a of assignments) {
    if (ctx.prefs.get(a.staffId)?.get(a.date) === "off") {
      warnings.offConflicts.push({ date: a.date, staffId: a.staffId });
    }
    if (!ctx.availableStores.get(a.staffId)?.has(a.storeId)) {
      warnings.storeConflicts.push({ date: a.date, staffId: a.staffId, storeId: a.storeId });
    }
  }

  // 連勤チェック（前月末からの持ち越しを含む）
  const byStaff = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!byStaff.has(a.staffId)) byStaff.set(a.staffId, new Set());
    byStaff.get(a.staffId)!.add(a.date);
  }
  for (const [staffId, ownDates] of byStaff) {
    const prevSet = ctx.prevMonthAssignedDates.get(staffId) ?? new Set<string>();
    // 当月内の各連続区間を、その先頭日から走査する
    for (const date of dates) {
      if (!ownDates.has(date)) continue;
      if (ownDates.has(addDays(date, -1))) continue; // 当月内で前日も勤務＝区間の途中なのでスキップ
      let end = date;
      let length = 1;
      while (ownDates.has(addDays(end, 1))) {
        end = addDays(end, 1);
        length++;
      }
      // 前月末から続いている連勤を加算（月またぎ）
      let back = addDays(date, -1);
      while (prevSet.has(back)) {
        length++;
        back = addDays(back, -1);
      }
      if (length > ctx.rules.maxConsecutiveDays) {
        warnings.consecutive.push({ staffId, from: date, to: end, length });
      }
    }
  }

  return warnings;
}
