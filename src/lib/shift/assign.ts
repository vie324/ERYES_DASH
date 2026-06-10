// シフト自動割当（貪欲法）と割当ボードの警告計算。
// 思想：自動割当はあくまで「下書き」。ルールを満たせない箇所は警告として出し、
// 最終判断は管理者の手動調整に委ねる（無理な最適化はしない）。

import { addDays, datesOfMonth } from "@/lib/date";
import type {
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
 * 自動割当の本体。日付→店舗の順に、勤務可能なスタッフを公平に（当月の割当数が
 * 少ない人から）埋めていく。最低人数に届かない店舗・日は警告として返す。
 */
export function generateAssignments(ctx: AssignContext): {
  assignments: NewShiftAssignment[];
  warnings: CoverageWarning[];
} {
  const dates = datesOfMonth(ctx.targetMonth);
  const assignments: NewShiftAssignment[] = [];
  const warnings: CoverageWarning[] = [];

  // 連勤判定用の割当済み日付（前月分を持ち越し）
  const assignedDates = new Map<string, Set<string>>();
  // 公平性：当月の割当数が少ない人を優先
  const assignedCount = new Map<string, number>();
  for (const s of ctx.staffIds) {
    assignedDates.set(s, new Set(ctx.prevMonthAssignedDates.get(s) ?? []));
    assignedCount.set(s, 0);
  }

  dates.forEach((date, dayIndex) => {
    // 店舗の処理順を日ごとにローテーションし、人手不足が特定店舗に偏らないようにする
    const storeOrder = ctx.storeIds.map(
      (_, i) => ctx.storeIds[(i + dayIndex) % ctx.storeIds.length]
    );
    const assignedToday = new Set<string>(); // この日すでにどこかの店舗に入った人

    for (const storeId of storeOrder) {
      const required = ctx.rules.minStaffPerStoreDay;
      const earlyLateCount = { early: 0, late: 0 };

      const candidates = ctx.staffIds.filter((staffId) => {
        if (assignedToday.has(staffId)) return false;
        if (!ctx.availableStores.get(staffId)?.has(storeId)) return false; // 勤務可能店舗のみ
        if (ctx.prefs.get(staffId)?.get(date) === "off") return false; // 休み希望日は割り当てない
        // 連勤上限：この日を足して上限を超えるなら不可
        return runLengthBefore(assignedDates.get(staffId)!, date) < ctx.rules.maxConsecutiveDays;
      });

      // 当月の割当数が少ない順（同数なら候補リスト順で安定）
      candidates.sort((a, b) => assignedCount.get(a)! - assignedCount.get(b)!);

      const picked = candidates.slice(0, required);
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
    }
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
