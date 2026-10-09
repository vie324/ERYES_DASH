// シフト表の自動作成（貪欲法）と、シフト表の警告計算。
// 思想：自動作成はあくまで「下書き」。ルールを満たせない箇所は警告として出し、
// 最終判断は管理者の手動調整に委ねる（無理な最適化はしない）。
//
// 前提として守ること
//  ・希望休の日、基本パターンで出勤しない曜日（定休日など）、管理者が個別調整で休みにした日は入れない
//  ・管理者が個別調整で「出勤」にした日は必ず入れる（時間もその内容で）
//  ・勤務できる店舗（本人が選んだ店舗。選んでいなければ所属店舗）にだけ入れる
//  ・連勤の上限を超えない（前の月からの続きも数える）
//  ・勤務時間は基本パターンの時間を入れる
//
// 組み方（ENiの運用ルール。重みは ASSIGN_WEIGHTS）
//  1. スタイリストの休みを先に決める。希望休は必ず守り、平日に連勤上限の都合で休む日は
//     スタイリスト同士が同じ日にならないように散らす（3段のスタイリスト同士は必ず別の日）
//  2. 働けるスタイリストを各店舗に均等に配置する（所属店舗があればそこを優先）
//  3. アシスタントは「その店舗のスタイリストの段数の合計 〜 ＋2人」を目安に入れる。
//     それ以上に人が余る日は「有休を使ってもらう候補」としてボードに出す
//     ※ スタイリストがいない店舗（アイサロンなど）にはこの上限をかけず、出られる人を全員入れる
//  4. 土日はなるべく出勤。人を絞るときは段数の多い人を残し、1段の人から休みにする
//  5. しもん塾・全体ミーティングなど全員参加の日は、出られる人を全員入れる（人数の上限なし）
//  6. 幹部会議など会議のある日は、その参加者を休みにしない
//  7. 段数の多いスタイリストが休む日は、年数の高いアシスタント（ファイナル・ミドル）も休みに寄せる

import { addDays, datesOfMonth, weekdayOf } from "@/lib/date";
import type {
  AssistantRank,
  JobType,
  NewShiftAssignment,
  ShiftAssignment,
  ShiftPreference,
  ShiftRules,
} from "@/lib/data/types";

/** 基本パターン1曜日分（自動作成用） */
export interface PatternDay {
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

/** 個別調整1日分（自動作成用） */
export interface OverrideDay {
  isWorking: boolean;
  startTime: string;
  endTime: string;
  note: string;
}

export interface AssignContext {
  targetMonth: string;
  storeIds: string[]; // 配置対象の店舗（全店舗）
  staffIds: string[]; // 自動作成の対象スタッフ（在籍中で、希望休の提出か基本パターンがある人）
  /** staffId → 日付 → 希望（休み＝希望休／早番・遅番＝旧シフト希望の名残）。行が無い日は「指定なし」 */
  prefs: Map<string, Map<string, ShiftPreference>>;
  /** staffId → その月に勤務できる店舗。キーが無い人は入れない */
  availableStores: Map<string, Set<string>>;
  rules: ShiftRules;
  /** 前月に出勤した日（staffId → 日付集合）。月またぎの連勤判定に使う */
  prevMonthAssignedDates: Map<string, Set<string>>;
  /** staffId → 職種。スタイリストは先に休みと配置を決める（未指定は "" 扱い） */
  jobTypes?: Map<string, JobType>;
  /** staffId → 段数。アシスタントの人数の目安と、土日に誰を残すかの判断に使う（未指定は1段） */
  tiers?: Map<string, number>;
  /** staffId → アシスタントのランク。段数の多いスタイリストが休む日に、年数の高い人を休みに寄せる */
  ranks?: Map<string, AssistantRank>;
  /** staffId → 所属店舗。同じ条件なら所属店舗に入れる */
  homeStores?: Map<string, string>;
  /** 全員参加イベントの日（しもん塾・全体会議など）。出られる人を全員出勤にする */
  allHandsDates?: Set<string>;
  /** 日付 → その日の会議（幹部会議など）の参加者。休みにしない */
  requiredByDate?: Map<string, Set<string>>;
  /**
   * staffId → 曜日(0=日〜6=土) → 基本パターン。出勤する曜日が1つでもある人だけ入れる。
   * 出勤しない曜日は休み（定休日など）、出勤する曜日はその時間で入れる
   */
  patterns?: Map<string, Map<number, PatternDay>>;
  /** staffId → 日付 → 個別調整（管理者が先に決めた日）。休みなら入れない、出勤なら必ず入れる */
  overrides?: Map<string, Map<string, OverrideDay>>;
}

/**
 * 自動作成の重みづけ。「どれを優先するか」をここに集約しておき、
 * 運用に合わなければこの数字だけを触れば挙動が変わるようにする。
 */
export const ASSIGN_WEIGHTS = {
  /** 当月の割当が少ない人を優先（公平性）。1件あたりの重み */
  fairness: 10,
  /** 所属店舗に入れる（同じ条件なら自分のお店へ） */
  homeStore: 15,
  /** その日の会議の参加者（幹部会議の幹部など）は必ず入れる */
  meetingRequired: 150,
  /** 土日：段数の多い人を残す（1段の人から休みにする）。1段あたりの重み */
  weekendTier: 25,
  /**
   * 平日：今ここで入れると、次の土日・全員参加イベントに連勤上限で入れなくなる人を後回しにする。
   * 段数を掛けるので、段数の多い人ほど平日に休んでもらい、土日の戦力を残す。
   */
  weekendReserve: 70,
  /**
   * 段数の多いスタイリストが休む日は、年数の高いアシスタント（ミドル1・ファイナル2）を休みに寄せる。
   * 土日前の連勤調整（weekendReserve）より強くして、この寄せが実際に効くようにしている。
   */
  seniorAlign: 60,
} as const;

/** アシスタントの人数の目安：スタイリストの段数の合計 〜 ＋この人数まで */
export const ASSISTANT_MARGIN = 2;
/** 段数がこれ以上のスタイリストは主力。同じ日に2人以上休ませない */
export const TOP_TIER = 3;
/** 段数がこれ以上のスタイリストが休む日は、年数の高いアシスタントも休みに寄せる */
export const HIGH_TIER = 2;

/** アシスタントの年数の目安（ランク）。ファイナル＞ミドル＞ファースト */
const RANK_SENIORITY: Record<AssistantRank, number> = { "": 0, first: 0, middle: 1, final: 2 };

/** 土日か（0=日・6=土） */
function isWeekend(date: string): boolean {
  const wd = weekdayOf(date);
  return wd === 0 || wd === 6;
}

/**
 * 「この人はこの日は休み」と決まっているか（自動作成で動かせない休み）。
 * 希望休・基本パターンで出勤しない曜日・個別調整の休み。
 */
export function isFixedOff(
  ctx: Pick<AssignContext, "prefs" | "patterns" | "overrides">,
  staffId: string,
  date: string
): boolean {
  const override = ctx.overrides?.get(staffId)?.get(date);
  if (override) return !override.isWorking;
  if (ctx.prefs.get(staffId)?.get(date) === "off") return true;
  const pattern = ctx.patterns?.get(staffId);
  if (pattern) return !(pattern.get(weekdayOf(date))?.isWorking ?? false);
  return false;
}

/** 基本パターン上、その曜日はお休みか（定休日の判定用。希望休は含めない） */
function isPatternOff(ctx: Pick<AssignContext, "patterns">, staffId: string, date: string): boolean {
  const pattern = ctx.patterns?.get(staffId);
  return pattern ? !(pattern.get(weekdayOf(date))?.isWorking ?? false) : false;
}

/**
 * スタイリストが入る店舗（アシスタントの人数を段数で絞る店舗）。
 * スタイリストが1人も入れない店舗（アイサロンなど）は、出られる人を全員入れる。
 */
export function stylistStoresOf(
  ctx: Pick<AssignContext, "staffIds" | "availableStores" | "jobTypes">
): Set<string> {
  const stores = new Set<string>();
  for (const s of ctx.staffIds) {
    if (ctx.jobTypes?.get(s) !== "stylist") continue;
    for (const storeId of ctx.availableStores.get(s) ?? []) stores.add(storeId);
  }
  return stores;
}

/**
 * その店舗がその日に開いている見込みか。
 * その店舗に入れる人が全員、基本パターンでその曜日はお休み＝定休日として、人数不足にしない。
 */
export function isStoreOpenOn(
  ctx: Pick<AssignContext, "staffIds" | "availableStores" | "patterns">,
  storeId: string,
  date: string
): boolean {
  return ctx.staffIds.some(
    (s) => (ctx.availableStores.get(s)?.has(storeId) ?? false) && !isPatternOff(ctx, s, date)
  );
}

/** 出勤する日の時間とメモ（個別調整 ＞ 基本パターン） */
function workTimeOf(
  ctx: Pick<AssignContext, "patterns" | "overrides">,
  staffId: string,
  date: string
): { startTime: string; endTime: string; note: string } {
  const override = ctx.overrides?.get(staffId)?.get(date);
  if (override?.isWorking) {
    return { startTime: override.startTime, endTime: override.endTime, note: override.note };
  }
  const p = ctx.patterns?.get(staffId)?.get(weekdayOf(date));
  return p?.isWorking ? { startTime: p.startTime, endTime: p.endTime, note: "" } : { startTime: "", endTime: "", note: "" };
}

/**
 * その日から先を見て、直近の「必ず出たい日」（土日・全員参加イベント・会議など）が
 * 終わるまでの日数を返す。連続している分（土＋日、イベントが土日に続く場合など）はまとめて数える。
 * その手前に本人の休み（希望休・定休日など）があれば、そこで連勤が一度切れるので 0（今日入れても支障なし）。
 * 見つからなければ 0。
 */
function daysThroughNextPriority(
  date: string,
  priority: (d: string) => boolean,
  ownOff: (d: string) => boolean = () => false
): number {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    if (ownOff(d)) return 0;
    if (!priority(d)) continue;
    let end = i;
    while (end < 14 && !ownOff(addDays(date, end + 1)) && priority(addDays(date, end + 1))) end++;
    return end;
  }
  return 0;
}

/** 次の「全員に出てほしい日」まで、今日を含めて平日が何日あるか（無ければ 0） */
function daysUntilNextPriority(date: string, priority: (d: string) => boolean): number {
  for (let i = 1; i <= 7; i++) {
    if (priority(addDays(date, i))) return i;
  }
  return 0;
}

export interface CoverageWarning {
  date: string;
  storeId: string;
  assigned: number;
  required: number;
}

/** 人が余っている日（有休を使ってもらう候補） */
export interface SurplusInfo {
  date: string;
  staffIds: string[];
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
 * 自動作成の本体。日付ごとに「個別調整で出勤の人 → スタイリストの休み → スタイリストの配置 →
 * アシスタントの配置」の順で決める。最低人数に届かない店舗・日は警告として返し、
 * 人が余った日は有休候補として返す（自動作成はあくまで下書き）。
 */
export function generateAssignments(ctx: AssignContext): {
  assignments: NewShiftAssignment[];
  warnings: CoverageWarning[];
  surplus: SurplusInfo[];
} {
  const dates = datesOfMonth(ctx.targetMonth);
  const assignments: NewShiftAssignment[] = [];
  const warnings: CoverageWarning[] = [];
  const surplus: SurplusInfo[] = [];

  const jobTypeOf = (staffId: string) => ctx.jobTypes?.get(staffId) ?? "";
  const tierOf = (staffId: string) => Math.max(1, ctx.tiers?.get(staffId) ?? 1);
  const isStylist = (staffId: string) => jobTypeOf(staffId) === "stylist";
  const seniorityOf = (staffId: string) => RANK_SENIORITY[ctx.ranks?.get(staffId) ?? ""];
  const inRoster = (staffId: string) => (ctx.availableStores.get(staffId)?.size ?? 0) > 0;
  const fixedOff = (staffId: string, d: string) => isFixedOff(ctx, staffId, d);
  const forcedOn = (staffId: string, d: string) => ctx.overrides?.get(staffId)?.get(d)?.isWorking === true;
  const stylistStores = stylistStoresOf(ctx);

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
  const isTop = (staffId: string) => isStylist(staffId) && tierOf(staffId) >= TOP_TIER;
  const topStylists = ctx.staffIds.filter((s) => isTop(s) && inRoster(s));
  /**
   * 他の3段スタイリストが休みになりそうな日（3段同士を必ず別々にするため）。
   * 決まっている休み（希望休・定休日など）に加えて、「このまま毎日出ると連勤上限で休みになる日」も先読みする。
   * 先読みは各日の処理の最初に更新する（forecastTopOff）。
   */
  let topOffForecast = new Map<string, Set<string>>();
  const forecastTopOff = (from: string): Map<string, Set<string>> => {
    const map = new Map<string, Set<string>>();
    for (const o of topStylists) {
      const off = new Set<string>();
      let run = runLengthBefore(assignedDates.get(o)!, from);
      for (let i = 0; i <= 14; i++) {
        const d = addDays(from, i);
        if (fixedOff(o, d)) {
          off.add(d);
          run = 0;
        } else if (run >= ctx.rules.maxConsecutiveDays && !forcedOn(o, d)) {
          off.add(d);
          run = 0;
        } else {
          run++;
        }
      }
      map.set(o, off);
    }
    return map;
  };
  /**
   * その人にとって「必ず出たい日」：土日・全員参加イベント・自分が出る会議・個別調整で出勤の日、
   * そして3段のスタイリストなら「他の3段が休みになりそうな日」。
   */
  const mustWork = (staffId: string, d: string): boolean =>
    isPriorityDay(d) ||
    forcedOn(staffId, d) ||
    (ctx.requiredByDate?.get(d)?.has(staffId) ?? false) ||
    (isTop(staffId) &&
      topStylists.some((o) => o !== staffId && (topOffForecast.get(o)?.has(d) ?? false)));

  dates.forEach((date, dayIndex) => {
    topOffForecast = forecastTopOff(date);
    // 店舗の処理順を日ごとにローテーションし、人手不足が特定店舗に偏らないようにする
    const storeOrder = ctx.storeIds.map(
      (_, i) => ctx.storeIds[(i + dayIndex) % ctx.storeIds.length]
    );
    const weekend = isWeekend(date);
    const allHands = ctx.allHandsDates?.has(date) ?? false;
    const priorityDay = weekend || allHands;
    const tomorrow = addDays(date, 1);

    const runBefore = (staffId: string) => runLengthBefore(assignedDates.get(staffId)!, date);
    /** 管理者が個別調整で「出勤」にした人（連勤上限・希望休より優先して必ず入れる） */
    const forcedToday = ctx.staffIds.filter((s) => inRoster(s) && forcedOn(s, date));
    /** 今日働ける人（決まっている休み・連勤上限を除く。個別調整で出勤の人は別枠） */
    const canWorkToday = (staffId: string): boolean => {
      if (!inRoster(staffId) || forcedOn(staffId, date)) return false;
      if (fixedOff(staffId, date)) return false;
      return runBefore(staffId) < ctx.rules.maxConsecutiveDays;
    };
    /** この日入れると、次の「必ず出たい日」（土日・イベント・会議など）に連勤上限で入れなくなるか */
    const blocksMust = (staffId: string): boolean => {
      const through = daysThroughNextPriority(
        date,
        (d) => mustWork(staffId, d),
        (d) => fixedOff(staffId, d)
      );
      if (through === 0) return false;
      return runBefore(staffId) + 1 + through > ctx.rules.maxConsecutiveDays;
    };

    const availableToday = ctx.staffIds.filter(canWorkToday);
    const stylistsAvail = availableToday.filter(isStylist);

    // ---- 1. スタイリストの休み（平日のみ）----
    // 今日入れると次の土日・イベント・会議に出られなくなるスタイリストは、今日休みにする候補。
    // 人数は残りの平日に散らし、同じ日に固まらないようにする（3段同士は必ず別の日）。
    const resting = new Set<string>();
    // 3段のスタイリストがすでに今日休み（希望休・連勤上限など）なら、もう1人の3段は今日休ませない
    let topResting = topStylists.some((s) => !stylistsAvail.includes(s) && !forcedToday.includes(s));
    if (!priorityDay) {
      const needRest = stylistsAvail
        .filter((s) => !mustWork(s, date) && blocksMust(s))
        .sort((a, b) => tierOf(b) - tierOf(a)); // 段数の多い人から先に平日の休みを取る
      const horizon = Math.min(
        ...needRest.map((s) => daysUntilNextPriority(date, (d) => mustWork(s, d)) || 1)
      );
      const slots = needRest.length > 0 ? Math.ceil(needRest.length / Math.max(1, horizon)) : 0;
      for (const s of needRest) {
        if (resting.size >= slots) break;
        if (isTop(s) && topResting) continue;
        resting.add(s);
        if (isTop(s)) topResting = true;
      }
    }

    const workingStylists = [
      ...forcedToday.filter(isStylist),
      ...stylistsAvail.filter((s) => !resting.has(s)),
    ];
    // 段数の多いスタイリストが今日休み（希望休・連勤・計画休み）か → 年数の高いアシスタントも休みに寄せる
    const highTierStylistOff = ctx.staffIds.some(
      (s) => isStylist(s) && inRoster(s) && tierOf(s) >= HIGH_TIER && !workingStylists.includes(s)
    );

    const assignedToday = new Set<string>();
    /** 高いほど先に入れる。同点は候補リスト順で安定させる */
    const scoreOf = (staffId: string, storeId: string): number => {
      let score = -assignedCount.get(staffId)! * ASSIGN_WEIGHTS.fairness;
      if (ctx.homeStores?.get(staffId) === storeId) score += ASSIGN_WEIGHTS.homeStore;
      if (ctx.requiredByDate?.get(date)?.has(staffId)) score += ASSIGN_WEIGHTS.meetingRequired;
      if (weekend) {
        // 土日は段数の多い人を残す＝1段の人から休みになる
        score += (tierOf(staffId) - 1) * ASSIGN_WEIGHTS.weekendTier;
      } else if (blocksMust(staffId)) {
        // 平日：ここで入れると土日・全員参加イベントに続けて出られなくなる人は後回しにする
        score -= ASSIGN_WEIGHTS.weekendReserve * tierOf(staffId);
      }
      if (!isStylist(staffId) && highTierStylistOff) {
        score -= ASSIGN_WEIGHTS.seniorAlign * seniorityOf(staffId);
      }
      return score;
    };
    const pickBest = (pool: string[], storeId: string): string => {
      let best = pool[0];
      let bestScore = scoreOf(best, storeId);
      for (let i = 1; i < pool.length; i++) {
        const score = scoreOf(pool[i], storeId);
        if (score > bestScore) {
          bestScore = score;
          best = pool[i];
        }
      }
      return best;
    };

    const earlyLateCount = new Map(storeOrder.map((st) => [st, { early: 0, late: 0 }]));
    const pickedByStore = new Map<string, string[]>(storeOrder.map((st) => [st, []]));
    const place = (staffId: string, storeId: string) => {
      const pref = ctx.prefs.get(staffId)?.get(date);
      const counts = earlyLateCount.get(storeId)!;
      // 早番・遅番の希望があれば尊重し、指定なしなら少ない側に入れてバランスを取る
      const shiftType =
        pref === "early" || pref === "late"
          ? pref
          : counts.early <= counts.late
            ? "early"
            : "late";
      counts[shiftType]++;
      assignments.push({ date, staffId, storeId, shiftType, ...workTimeOf(ctx, staffId, date) });
      pickedByStore.get(storeId)!.push(staffId);
      assignedToday.add(staffId);
      assignedDates.get(staffId)!.add(date);
      assignedCount.set(staffId, assignedCount.get(staffId)! + 1);
    };
    /** place の取り消し（連勤の谷ならしで、入れた人を休みに変えるとき） */
    const unplace = (staffId: string, storeId: string) => {
      const idx = assignments.findIndex((a) => a.date === date && a.staffId === staffId);
      if (idx === -1) return;
      const counts = earlyLateCount.get(storeId)!;
      counts[assignments[idx].shiftType]--;
      assignments.splice(idx, 1);
      const picked = pickedByStore.get(storeId)!;
      picked.splice(picked.indexOf(staffId), 1);
      assignedToday.delete(staffId);
      assignedDates.get(staffId)!.delete(date);
      assignedCount.set(staffId, assignedCount.get(staffId)! - 1);
    };
    /**
     * 店舗を順番に回りながら1人ずつ入れる（ラウンドロビン）。
     * 店舗ごとに順番に埋めると先の店舗が人を取り切ってしまうので、どの店舗にも均等に行き渡らせる。
     */
    const fillRoundRobin = (pool: string[], targetOf: (storeId: string) => number) => {
      let progress = true;
      while (progress && pool.length > 0) {
        progress = false;
        for (const storeId of storeOrder) {
          if (pickedByStore.get(storeId)!.length >= targetOf(storeId)) continue;
          const cands = pool.filter((s) => ctx.availableStores.get(s)!.has(storeId));
          if (cands.length === 0) continue;
          const best = pickBest(cands, storeId);
          pool.splice(pool.indexOf(best), 1);
          place(best, storeId);
          progress = true;
        }
      }
    };

    // ---- 0. 個別調整で「出勤」の人を先に入れる（所属店舗を優先）----
    for (const s of forcedToday) {
      const allowed = ctx.availableStores.get(s)!;
      const home = ctx.homeStores?.get(s);
      const storeId = home && allowed.has(home) ? home : (storeOrder.find((st) => allowed.has(st)) ?? [...allowed][0]);
      if (!pickedByStore.has(storeId)) continue; // 店舗一覧に無い店舗（削除済みなど）
      place(s, storeId);
    }

    // ---- 2. スタイリストを各店舗に均等に配置 ----
    fillRoundRobin(
      stylistsAvail.filter((s) => !resting.has(s)),
      () => Number.POSITIVE_INFINITY
    );

    // ---- 3. アシスタント：段数の合計 〜 ＋2人まで（全員参加の日・スタイリストのいない店舗は上限なし）----
    const stylistTiersOf = (storeId: string) =>
      pickedByStore.get(storeId)!.reduce((sum, s) => sum + (isStylist(s) ? tierOf(s) : 0), 0);
    const targetOf = (storeId: string) =>
      allHands || !stylistStores.has(storeId)
        ? Number.POSITIVE_INFINITY
        : pickedByStore.get(storeId)!.filter(isStylist).length +
          Math.max(stylistTiersOf(storeId) + ASSISTANT_MARGIN, ctx.rules.minStaffPerStoreDay - pickedByStore.get(storeId)!.filter(isStylist).length);
    const assistantPool = availableToday.filter((s) => !isStylist(s) && !resting.has(s));
    // スタイリストのいない店舗（アイサロンなど）にしか入れない人は、所属店舗に入れてから、
    // 残りを順番に配り、最低人数に足りない店舗へ融通する（2人しかいないのに2店舗に分けて両方足りない、を防ぐ）
    const plainStores = storeOrder.filter((st) => !stylistStores.has(st));
    if (plainStores.length > 0) {
      const onlyPlain = assistantPool.filter((s) =>
        [...ctx.availableStores.get(s)!].every((st) => !stylistStores.has(st))
      );
      const rest: string[] = [];
      for (const s of onlyPlain) {
        const home = ctx.homeStores?.get(s);
        if (home && ctx.availableStores.get(s)!.has(home) && pickedByStore.has(home)) place(s, home);
        else rest.push(s);
      }
      fillRoundRobin(rest, () => Number.POSITIVE_INFINITY);
      for (const short of plainStores) {
        while (pickedByStore.get(short)!.length < ctx.rules.minStaffPerStoreDay) {
          let moved = false;
          for (const donor of plainStores) {
            const donorPicked = pickedByStore.get(donor)!;
            if (donor === short || donorPicked.length <= ctx.rules.minStaffPerStoreDay) continue;
            const cands = donorPicked
              .filter((s) => !forcedToday.includes(s) && ctx.availableStores.get(s)!.has(short))
              // 所属店舗でない人から動かす
              .sort((a, b) => Number(ctx.homeStores?.get(a) === donor) - Number(ctx.homeStores?.get(b) === donor));
            if (cands.length === 0) continue;
            unplace(cands[0], donor);
            place(cands[0], short);
            moved = true;
            break;
          }
          if (!moved) break;
        }
      }
      for (const s of onlyPlain) assistantPool.splice(assistantPool.indexOf(s), 1);
    }
    fillRoundRobin(assistantPool, targetOf);

    // ---- 4. 連勤の谷を散らす ----
    // 全員が同じ日に連勤上限で休むと、その日だけ人が足りなくなる。明日まとめて休みになる人が
    // 「1日あたりの目安（人数÷(連勤上限+1)）」より多ければ、一部を今日のうちに休みに変えて谷をならす。
    // 上の人数枠で今日すでに休みになった人はそのまま数え、足りない分だけ入れ替える
    // （休ませる順：アシスタント → 段数の少ないスタイリスト。3段同士は同じ日にしない）。
    if (!priorityDay && !isPriorityDay(tomorrow)) {
      const quota = Math.ceil(availableToday.length / (ctx.rules.maxConsecutiveDays + 1));
      const forcedTomorrow = availableToday.filter(
        (s) =>
          !mustWork(s, date) &&
          runBefore(s) + 1 >= ctx.rules.maxConsecutiveDays &&
          !fixedOff(s, tomorrow) &&
          !forcedOn(s, tomorrow)
      );
      const extra = forcedTomorrow.length - Math.max(0, quota - resting.size);
      let need = extra - forcedTomorrow.filter((s) => !assignedToday.has(s)).length;
      if (need > 0) {
        const storeOf = (s: string) => assignments.find((a) => a.date === date && a.staffId === s)?.storeId ?? "";
        const order = forcedTomorrow
          .filter((s) => assignedToday.has(s))
          .sort(
            (a, b) =>
              Number(isStylist(a)) - Number(isStylist(b)) ||
              (isStylist(a) ? tierOf(a) - tierOf(b) : 0) ||
              scoreOf(a, storeOf(a)) - scoreOf(b, storeOf(b))
          );
        for (const s of order) {
          if (need <= 0) break;
          if (isTop(s) && topResting) continue;
          const storeId = storeOf(s);
          // 空いた枠に入れられる人（明日休みにならない人）。同じ職種で埋める
          const spare = availableToday.filter(
            (x) =>
              !assignedToday.has(x) &&
              !resting.has(x) &&
              !forcedTomorrow.includes(x) &&
              isStylist(x) === isStylist(s) &&
              ctx.availableStores.get(x)!.has(storeId)
          );
          // その店舗のスタイリストが最後の1人なら、代わりがいない限り外さない（各店舗にスタイリストを残す）
          if (isStylist(s) && spare.length === 0 && pickedByStore.get(storeId)!.filter(isStylist).length <= 1) continue;
          unplace(s, storeId);
          resting.add(s);
          if (isTop(s)) topResting = true;
          need--;
          if (spare.length > 0) place(pickBest(spare, storeId), storeId);
        }
      }
    }

    // スタイリストが入れ替わって段数が減った店舗は、アシスタントも上限（段数＋2）まで戻す
    // （個別調整で出勤の人は外さない）
    if (!allHands) {
      for (const storeId of storeOrder) {
        for (;;) {
          const picked = pickedByStore.get(storeId)!;
          const assistants = picked.filter((s) => !isStylist(s) && !forcedToday.includes(s));
          const cap = targetOf(storeId) - picked.filter((s) => isStylist(s) || forcedToday.includes(s)).length;
          if (assistants.length === 0 || assistants.length <= cap) break;
          let lowest = assistants[0];
          for (const a of assistants) if (scoreOf(a, storeId) < scoreOf(lowest, storeId)) lowest = a;
          unplace(lowest, storeId);
        }
      }
    }

    for (const storeId of storeOrder) {
      const picked = pickedByStore.get(storeId)!.length;
      if (picked < ctx.rules.minStaffPerStoreDay && isStoreOpenOn(ctx, storeId, date)) {
        warnings.push({ date, storeId, assigned: picked, required: ctx.rules.minStaffPerStoreDay });
      }
    }

    // ---- 5. 余った人＝有休を使ってもらう候補（連勤調整の計画休みは除く）----
    const leftover = availableToday.filter((s) => !assignedToday.has(s) && !resting.has(s));
    if (leftover.length > 0 && !allHands) surplus.push({ date, staffIds: leftover });
  });

  return { assignments, warnings, surplus };
}

// ---- シフト表の警告計算（自動・手動を問わず現在のシフト表全体を検査する） ----

export interface BoardWarnings {
  /** 最低人数に届かない 店舗×日（定休日・誰も入れない店舗は除く） */
  coverage: CoverageWarning[];
  /** 希望休の日に出勤になっている */
  offConflicts: { date: string; staffId: string }[];
  /** 本人が選んだ勤務できる店舗の外に入っている */
  storeConflicts: { date: string; staffId: string; storeId: string }[];
  /** 連勤上限の超過（連続区間ごと） */
  consecutive: { staffId: string; from: string; to: string; length: number }[];
  /** スタイリストの休みが同じ日に重なっている（top=3段同士。必ず別々にするルール） */
  stylistOffOverlap: { date: string; staffIds: string[]; top: boolean }[];
  /** スタイリストが1人もいない 店舗×日（スタイリストが入る店舗で、人はいるのにスタイリスト不在） */
  noStylist: { date: string; storeId: string }[];
  /** 会議の参加者なのに、その日が休み */
  meetingAbsent: { date: string; staffId: string }[];
  /** 人が余っている日（各店舗が段数＋2に達しているのに、出られる人が残っている）＝有休候補 */
  surplus: SurplusInfo[];
}

export type BoardContext = Pick<AssignContext, "storeIds" | "prefs" | "availableStores" | "rules"> & {
  prevMonthAssignedDates: Map<string, Set<string>>;
} & Partial<
    Pick<
      AssignContext,
      "staffIds" | "jobTypes" | "tiers" | "requiredByDate" | "allHandsDates" | "patterns" | "overrides"
    >
  > & {
    /** 勤務できる店舗を本人が選んだ人（この人だけ「店舗の外」を警告する） */
    explicitStores?: Set<string>;
  };

/** 警告の件数（有休候補は参考なので数えない） */
export function countBoardWarnings(w: BoardWarnings): number {
  return (
    w.coverage.length +
    w.offConflicts.length +
    w.storeConflicts.length +
    w.consecutive.length +
    w.stylistOffOverlap.length +
    w.noStylist.length +
    w.meetingAbsent.length
  );
}

export function computeBoardWarnings(
  targetMonth: string,
  assignments: Pick<ShiftAssignment, "date" | "staffId" | "storeId">[],
  ctx: BoardContext
): BoardWarnings {
  const dates = datesOfMonth(targetMonth);
  const warnings: BoardWarnings = {
    coverage: [],
    offConflicts: [],
    storeConflicts: [],
    consecutive: [],
    stylistOffOverlap: [],
    noStylist: [],
    meetingAbsent: [],
    surplus: [],
  };
  const jobTypeOf = (staffId: string) => ctx.jobTypes?.get(staffId) ?? "";
  const tierOf = (staffId: string) => Math.max(1, ctx.tiers?.get(staffId) ?? 1);
  const isStylist = (staffId: string) => jobTypeOf(staffId) === "stylist";
  const inRoster = (staffId: string) => (ctx.availableStores.get(staffId)?.size ?? 0) > 0;
  const roster = ctx.staffIds ?? [...ctx.availableStores.keys()];
  const rosterCtx = { staffIds: roster, availableStores: ctx.availableStores, patterns: ctx.patterns };
  const stylistStores = stylistStoresOf({ ...rosterCtx, jobTypes: ctx.jobTypes });
  /** その月に誰か入れる店舗（誰も入れない店舗の人数不足は出さない） */
  const activeStores = ctx.storeIds.filter((storeId) => roster.some((s) => ctx.availableStores.get(s)?.has(storeId)));

  // 人数チェック（店舗×日。定休日は除く）
  const countByStoreDate = new Map<string, number>();
  for (const a of assignments) {
    const key = `${a.date}|${a.storeId}`;
    countByStoreDate.set(key, (countByStoreDate.get(key) ?? 0) + 1);
  }
  for (const date of dates) {
    for (const storeId of activeStores) {
      const assigned = countByStoreDate.get(`${date}|${storeId}`) ?? 0;
      if (assigned < ctx.rules.minStaffPerStoreDay && (assigned > 0 || isStoreOpenOn(rosterCtx, storeId, date))) {
        warnings.coverage.push({
          date,
          storeId,
          assigned,
          required: ctx.rules.minStaffPerStoreDay,
        });
      }
    }
  }

  // 希望休・店舗外への割当（手動調整で起こり得る。ブロックはせず警告表示のみ）
  for (const a of assignments) {
    if (ctx.prefs.get(a.staffId)?.get(a.date) === "off") {
      warnings.offConflicts.push({ date: a.date, staffId: a.staffId });
    }
    if (
      (ctx.explicitStores?.has(a.staffId) ?? true) &&
      !ctx.availableStores.get(a.staffId)?.has(a.storeId)
    ) {
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

  // ---- 日ごとの検査：スタイリストの休みの重なり／スタイリスト不在／会議参加者の休み／余り ----
  const byDate = new Map<string, Pick<ShiftAssignment, "date" | "staffId" | "storeId">[]>();
  for (const a of assignments) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date)!.push(a);
  }
  const rosterStylists = roster.filter((s) => isStylist(s) && inRoster(s));

  for (const date of dates) {
    const todays = byDate.get(date) ?? [];
    const assignedSet = new Set(todays.map((a) => a.staffId));
    const allHands = ctx.allHandsDates?.has(date) ?? false;

    // スタイリストの休みが重なっていないか（3段同士は必ず別々）。基本パターンでお休みの曜日（定休日）は数えない
    const stylistsOff = rosterStylists.filter((s) => !assignedSet.has(s) && !isPatternOff(ctx, s, date));
    if (stylistsOff.length >= 2) {
      const top = stylistsOff.filter((s) => tierOf(s) >= TOP_TIER).length >= 2;
      warnings.stylistOffOverlap.push({ date, staffIds: stylistsOff, top });
    }

    // 人はいるのにスタイリストがいない店舗（スタイリストが入る店舗だけ）
    for (const storeId of ctx.storeIds) {
      if (!stylistStores.has(storeId)) continue;
      const here = todays.filter((a) => a.storeId === storeId);
      if (here.length > 0 && !here.some((a) => isStylist(a.staffId))) {
        warnings.noStylist.push({ date, storeId });
      }
    }

    // 会議の参加者なのに休み
    for (const staffId of ctx.requiredByDate?.get(date) ?? []) {
      if (!assignedSet.has(staffId) && inRoster(staffId)) warnings.meetingAbsent.push({ date, staffId });
    }

    // 余り（有休候補）：スタイリストの入る各店舗のアシスタントが「段数の合計＋2」に達していて、
    // まだ出られる人が残っている日
    const capped = ctx.storeIds.filter((storeId) => stylistStores.has(storeId));
    if (!allHands && capped.length > 0) {
      const full = capped.every((storeId) => {
        const here = todays.filter((a) => a.storeId === storeId);
        const tiersHere = here.filter((a) => isStylist(a.staffId)).reduce((sum, a) => sum + tierOf(a.staffId), 0);
        const assistantsHere = here.filter((a) => !isStylist(a.staffId)).length;
        return assistantsHere >= tiersHere + ASSISTANT_MARGIN;
      });
      if (full) {
        const leftover = roster.filter((s) => {
          if (assignedSet.has(s) || !inRoster(s)) return false;
          // スタイリストのいない店舗にしか入れない人は数えない（そちらは上限なしで入れるため）
          if (![...(ctx.availableStores.get(s) ?? [])].some((st) => stylistStores.has(st))) return false;
          if (isFixedOff({ prefs: ctx.prefs, patterns: ctx.patterns, overrides: ctx.overrides }, s, date)) return false;
          const own = new Set([...(byStaff.get(s) ?? []), ...(ctx.prevMonthAssignedDates.get(s) ?? [])]);
          return runLengthBefore(own, date) < ctx.rules.maxConsecutiveDays;
        });
        if (leftover.length > 0) warnings.surplus.push({ date, staffIds: leftover });
      }
    }
  }

  return warnings;
}
