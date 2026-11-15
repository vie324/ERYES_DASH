// シフトの画面で使う「その月の表」をDBから読み込む（スタッフ・管理者・スケジュール画面で共通）。

import { monthRange } from "@/lib/date";
import { buildMonthSchedule, chosenStoresOf, type MonthSchedule } from "@/lib/shift/month";
import { listDayoffsWithLegacy } from "@/lib/shift/requests";
import type {
  DataStore,
  DayoffRequest,
  ScheduleOverride,
  ShiftAssignment,
  Staff,
  Store,
  WorkPatternDay,
} from "@/lib/data/types";

export interface LoadedMonth {
  stores: Store[];
  staffList: Staff[];
  activeStaff: Staff[];
  patterns: WorkPatternDay[];
  dayoffs: DayoffRequest[];
  overrides: ScheduleOverride[];
  assignments: ShiftAssignment[];
  schedule: MonthSchedule;
  /** その月に本人が選んだ「勤務できる店舗」（staffId → 店舗ID。店舗の表に出す人を決めるのに使う） */
  chosenStores: Map<string, Set<string>>;
}

/** その月の表を読み込む。showDraft＝下書きのシフト表も出す（管理者の画面だけ true） */
export async function loadMonthSchedule(db: DataStore, month: string, showDraft: boolean): Promise<LoadedMonth> {
  const range = monthRange(month);
  const [stores, staffList, patterns, dayoffs, overrides, assignments, available] = await Promise.all([
    db.listStores(),
    db.listStaff(),
    db.listWorkPatterns(),
    listDayoffsWithLegacy(db, range),
    db.listScheduleOverrides(range),
    db.listShiftAssignments(month),
    db.listAvailableStores(month),
  ]);
  const activeStaff = staffList.filter((s) => s.isActive);
  const schedule = buildMonthSchedule({
    month,
    staff: activeStaff,
    patterns,
    dayoffs,
    overrides,
    assignments,
    showDraft,
  });
  const chosenStores = chosenStoresOf(available, stores.map((s) => s.id));
  return { stores, staffList, activeStaff, patterns, dayoffs, overrides, assignments, schedule, chosenStores };
}

/** 1日分だけの予定（スケジュール画面の「みんなの予定」など）。シフト表は公開中のものだけ使う */
export async function loadDaySchedule(
  db: DataStore,
  date: string
): Promise<{ schedule: MonthSchedule; activeStaff: Staff[] }> {
  const month = date.slice(0, 7);
  const [staffList, patterns, dayoffs, overrides, assignments] = await Promise.all([
    db.listStaff(),
    db.listWorkPatterns(),
    listDayoffsWithLegacy(db, { from: date, to: date }),
    db.listScheduleOverrides({ from: date, to: date }),
    db.listShiftAssignments(month),
  ]);
  const activeStaff = staffList.filter((s) => s.isActive);
  const schedule = buildMonthSchedule({
    month,
    staff: activeStaff,
    patterns,
    dayoffs,
    overrides,
    assignments,
    showDraft: false,
  });
  return { schedule, activeStaff };
}
