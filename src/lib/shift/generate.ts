// 自動作成（シフト画面で表に出している人の分）。
//  ・月の休みの数が決まっている店舗（ENi など）の人 …… 休みの数で作る（lib/shift/calendar.ts）。
//      希望休を出していない人も含めて全員が対象。定休日・希望休・管理者が入れた休みを数え、足りない分を自動で入れる
//  ・それ以外の人 …… これまでどおり（基本パターン・連勤上限・段数＋2人まで。lib/shift/assign.ts）

import { datesOfMonth } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
import { buildQuotaShift, personalDaysOffTarget, quotaPersonOf, quotaRosterOf } from "@/lib/shift/calendar";
import type { ShiftMonthInputs } from "@/lib/shift/context";
import type { ShiftView } from "@/lib/shift/view";
import type { NewShiftAssignment, Staff, Store } from "@/lib/data/types";

/** 表示中の店舗のうち、月の休みの数が決まっている店舗 */
export function quotaStoreIdsOf(stores: Pick<Store, "id" | "monthlyDaysOff">[], storeFilter: string[]): Set<string> {
  return new Set(storeFilter.filter((id) => (stores.find((s) => s.id === id)?.monthlyDaysOff ?? 0) > 0));
}

/** その人が働く店舗：その月に選んだ店舗（表示中のもの）→ 所属店舗（表示中なら）→ 表示中の最初の店舗 */
export function workStoreOf(
  s: Pick<Staff, "id" | "storeId">,
  storeFilter: string[],
  chosenStores: Map<string, Set<string>>
): string {
  const chosen = [...(chosenStores.get(s.id) ?? [])].find((id) => storeFilter.includes(id));
  if (chosen) return chosen;
  if (storeFilter.includes(s.storeId)) return s.storeId;
  return storeFilter[0] ?? s.storeId;
}

/** 休みの数で作る人（表に出ている人のうち、月の休みの数が決まっている店舗で働く人。管理用のアカウントは除く） */
export function quotaMembersOf(inputs: Pick<ShiftMonthInputs, "stores" | "staffIds" | "chosenStores">, view: Pick<ShiftView, "members" | "storeFilter">): Staff[] {
  const quotaStores = quotaStoreIdsOf(inputs.stores, view.storeFilter);
  if (quotaStores.size === 0) return [];
  return quotaRosterOf(view.members, new Set(inputs.staffIds)).filter((s) =>
    quotaStores.has(workStoreOf(s, view.storeFilter, inputs.chosenStores))
  );
}

/** 全員参加の日：全体ミーティング・しもん塾など（会議）と、全員参加の会社のイベント */
export function allHandsDatesOf(inputs: Pick<ShiftMonthInputs, "targetMonth" | "allHandsDates" | "companyEvents">): Set<string> {
  const set = new Set(inputs.allHandsDates ?? []);
  const dates = datesOfMonth(inputs.targetMonth);
  for (const e of inputs.companyEvents) {
    if (!e.required) continue;
    for (const d of dates) if (d >= e.startDate && d <= e.endDate) set.add(d);
  }
  return set;
}

export interface ViewGeneration {
  assignments: NewShiftAssignment[];
  /** 休みの数で作った人 */
  quotaStaffIds: string[];
  /** これまでどおりの作り方で作った人 */
  otherStaffIds: string[];
  /** 休みを入れきれなかった人（staffId → 足りない日数） */
  shortfall: Map<string, number>;
}

export function generateForView(inputs: ShiftMonthInputs, view: ShiftView): ViewGeneration {
  const quotaMembers = quotaMembersOf(inputs, view);
  const quotaIds = new Set(quotaMembers.map((s) => s.id));
  const assignments: NewShiftAssignment[] = [];
  const shortfall = new Map<string, number>();

  if (quotaMembers.length > 0) {
    const targetByStore = new Map<string, number>();
    for (const id of quotaStoreIdsOf(inputs.stores, view.storeFilter)) {
      const store = inputs.stores.find((s) => s.id === id);
      const target = store ? personalDaysOffTarget(store, inputs.closures.get(id) ?? new Map()) : null;
      if (target !== null) targetByStore.set(id, target);
    }
    const { assignments: rows, plan } = buildQuotaShift({
      month: inputs.targetMonth,
      people: quotaMembers.map((s) => quotaPersonOf(s, workStoreOf(s, view.storeFilter, inputs.chosenStores))),
      closures: inputs.closures,
      targetByStore,
      prefs: inputs.prefs,
      patterns: inputs.patterns,
      overrides: inputs.overrides,
      allHandsDates: allHandsDatesOf(inputs),
      requiredByDate: inputs.requiredByDate ?? new Map(),
      maxConsecutiveDays: inputs.rules.maxConsecutiveDays,
      prevWorked: inputs.prevMonthAssignedDates,
    });
    assignments.push(...rows);
    for (const [id, n] of plan.shortfall) shortfall.set(id, n);
  }

  const otherStaffIds = inputs.staffIds.filter((id) => view.memberIds.has(id) && !quotaIds.has(id));
  if (otherStaffIds.length > 0) {
    assignments.push(...generateAssignments({ ...inputs, staffIds: otherStaffIds }).assignments);
  }
  return { assignments, quotaStaffIds: [...quotaIds], otherStaffIds, shortfall };
}
