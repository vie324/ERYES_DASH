// シフトのカレンダーの読み込み（管理者のカレンダー画面と、その保存の処理で同じものを使う）。
// 「その日だれが休みで、なぜ休みか」を、シフト表・個別調整・希望休・基本パターン・お店の休みから決める。

import { weekdayOf } from "@/lib/date";
import { buildMonthSchedule, brandStoreIds, type MonthSchedule, type ShiftStatus } from "@/lib/shift/month";
import { buildShiftMonthInputs, type ShiftMonthInputs } from "@/lib/shift/context";
import { resolveShiftView, viewStatus, type ShiftView } from "@/lib/shift/view";
import { workStoreOf } from "@/lib/shift/generate";
import {
  displayNames,
  personalDaysOffTarget,
  quotaRosterOf,
  type Closure,
  type PersonDay,
} from "@/lib/shift/calendar";
import type { DataStore, Staff, Store, StoreCalendarDay } from "@/lib/data/types";

export interface CalendarContext {
  month: string;
  inputs: ShiftMonthInputs;
  schedule: MonthSchedule;
  /** カレンダーの店舗の人たちの表（自動作成・公開などの操作も、この範囲にだけ効く） */
  view: ShiftView;
  /** カレンダーの店舗（1店舗ずつ見る） */
  store: Store;
  /** 業態の店舗（2つ以上あるときは切り替えのチップを出す） */
  storeChoices: Store[];
  /** カレンダーに出す人 */
  people: Staff[];
  names: Map<string, string>;
  /** 月の休みの数が決まっている（休みの数で作る） */
  quotaMode: boolean;
  /** 1人が自分で取る休みの数（決まっていなければ null） */
  target: number | null;
  closures: Map<string, Closure>;
  storeDays: Map<string, StoreCalendarDay>;
  status: ShiftStatus;
  /** その人のその日の予定 */
  dayOf(staffId: string, date: string): PersonDay;
  /** その人のその日の希望休 */
  requestOf(staffId: string, date: string): { reason: string; paidLeave: boolean } | null;
  /** 基本パターンで出ない曜日か（パターンのある人だけ） */
  patternOff(staffId: string, date: string): boolean;
  /** 基本パターンの時間（その曜日に出る人だけ） */
  patternTime(staffId: string, date: string): { startTime: string; endTime: string } | null;
}

export async function loadCalendarContext(
  db: DataStore,
  month: string,
  storeParam: string | undefined,
  brandLabel: string,
  /** showDraft: false ＝スタッフの画面（公開中のシフト表だけを使う） */
  opts: { showDraft?: boolean } = {}
): Promise<CalendarContext> {
  const showDraft = opts.showDraft ?? true;
  const inputs = await buildShiftMonthInputs(db, month);
  const { stores, activeStaff } = inputs;
  const schedule = buildMonthSchedule({
    month,
    staff: activeStaff,
    patterns: inputs.patternRows,
    dayoffs: inputs.dayoffs,
    overrides: inputs.overrideRows,
    assignments: inputs.assignments,
    showDraft,
  });
  const resolve = (param: string | undefined) =>
    resolveShiftView({ stores, activeStaff, schedule, storeParam: param, brandLabel, chosenStores: inputs.chosenStores });

  // カレンダーは1店舗ずつ。業態の店舗が2つ以上なら、選んだ店舗（無ければ最初の店舗）の人たちの表にする
  let view = resolve(storeParam);
  if (view.storeFilter.length !== 1) {
    const storeId = stores.some((s) => s.id === storeParam) ? storeParam! : view.storeFilter[0];
    view = resolve(storeId);
  }
  const store = stores.find((s) => s.id === view.storeFilter[0]) ?? stores[0];
  const brandIds = brandStoreIds(stores, brandLabel);
  const storeChoices = brandIds.length > 1 ? stores.filter((s) => brandIds.includes(s.id)) : [];

  const quotaMode = store.monthlyDaysOff > 0;
  const closures = inputs.closures.get(store.id) ?? new Map<string, Closure>();
  const target = personalDaysOffTarget(store, closures);
  const rosterIds = new Set(inputs.staffIds);
  const involved = (s: Staff) =>
    rosterIds.has(s.id) ||
    schedule.dates.some((d) => {
      const c = schedule.cell(s.id, d);
      return c.working || c.source !== "none";
    });
  const people = quotaMode
    ? quotaRosterOf(view.members, rosterIds).filter(
        (s) => workStoreOf(s, view.storeFilter, inputs.chosenStores) === store.id
      )
    : view.members.filter(involved);

  const requests = new Map(inputs.dayoffs.map((d) => [`${d.staffId}|${d.date}`, d]));
  const requestOf = (staffId: string, date: string) => {
    const r = requests.get(`${staffId}|${date}`);
    return r ? { reason: r.reason, paidLeave: r.paidLeave } : null;
  };
  const patternOff = (staffId: string, date: string) => {
    const p = inputs.patterns.get(staffId);
    return p ? !(p.get(weekdayOf(date))?.isWorking ?? false) : false;
  };
  const patternTime = (staffId: string, date: string) => {
    const p = inputs.patterns.get(staffId)?.get(weekdayOf(date));
    return p?.isWorking ? { startTime: p.startTime, endTime: p.endTime } : null;
  };

  const dayOf = (staffId: string, date: string): PersonDay => {
    const override = inputs.overrides.get(staffId)?.get(date);
    const request = requestOf(staffId, date);
    if (schedule.fromShift(staffId)) {
      if (schedule.cell(staffId, date).working) return { working: true };
      if (override && !override.isWorking) return { working: false, kind: "admin", reason: override.note };
      if (request) return { working: false, kind: "request", reason: request.reason, paidLeave: request.paidLeave };
      if (patternOff(staffId, date)) return { working: false, kind: "pattern" };
      return { working: false, kind: "auto" };
    }
    // シフト表に入っていない人（まだ作っていない月など）：いつもどおりの予定
    if (override) return override.isWorking ? { working: true } : { working: false, kind: "admin", reason: override.note };
    if (closures.has(date)) return { working: false };
    if (request) return { working: false, kind: "request", reason: request.reason, paidLeave: request.paidLeave };
    if (inputs.patterns.has(staffId)) return patternOff(staffId, date) ? { working: false, kind: "pattern" } : { working: true };
    // 休みの数で作る店舗は、休みの決まっていない日は出勤の見込みとして数える
    return quotaMode ? { working: true } : { working: false, kind: "auto" };
  };

  const storeDays = new Map(inputs.calendarDays.filter((d) => d.storeId === store.id).map((d) => [d.date, d]));
  return {
    month,
    inputs,
    schedule,
    view,
    store,
    storeChoices,
    people,
    names: displayNames(people),
    quotaMode,
    target,
    closures,
    storeDays,
    status: viewStatus(
      showDraft ? inputs.assignments : inputs.assignments.filter((a) => a.status === "confirmed"),
      view.memberIds
    ),
    dayOf,
    requestOf,
    patternOff,
    patternTime,
  };
}
