// シフト画面（管理者）の「いま表に出している範囲」＝店舗の絞り込みと、その対象のスタッフ。
// 画面の表示と、月の操作（自動作成・公開・下書きに戻す・下書きの削除・マスの保存）で同じ範囲を使う。
// ENi と EREYS のように業態ごとにシフトを作るとき、ENi の画面で「公開」しても
// EREYS のシフトまで公開されたり作り直されたりしないよう、操作は表に出ているスタッフにだけ効かせる。

import { getBrand, BRAND_INFO } from "@/lib/brand";
import {
  brandStoreIds,
  choseAnyStore,
  shiftStatusOf,
  staffForStores,
  type MonthSchedule,
  type ShiftStatus,
} from "@/lib/shift/month";
import type { ShiftAssignment, Staff, Store } from "@/lib/data/types";

export interface ShiftView {
  /** URLの store（"" ＝業態の店舗／"all"／店舗ID） */
  filterKey: string;
  /** 表示中の店舗 */
  storeFilter: string[];
  /** 業態に合う店舗（既定の絞り込み） */
  defaultStores: string[];
  /** 表に出すスタッフ（所属店舗が表示中の店舗にある人と、その店舗で出勤する人、希望休でその店舗を選んだ人） */
  members: Staff[];
  memberIds: Set<string>;
  /** 所属店舗が表示中の店舗にある、在籍中のスタッフの数（0なら所属店舗の設定がずれているかもしれない） */
  homeCount: number;
  /**
   * 表に出ている人のうち、所属店舗はほかの店舗なのに、希望休で表示中の店舗を選んだ人。
   * 所属店舗の直し忘れの目印（直すまで、希望休を出していない月はこの表に出ない）
   */
  chosenOnly: Staff[];
}

export function resolveShiftView(input: {
  stores: Store[];
  activeStaff: Staff[];
  schedule: MonthSchedule;
  storeParam: string | undefined;
  brandLabel: string;
  /** その月に本人が選んだ「勤務できる店舗」（staffId → 店舗ID） */
  chosenStores?: Map<string, Set<string>>;
}): ShiftView {
  const { stores, activeStaff, schedule, storeParam, chosenStores } = input;
  const defaultStores = brandStoreIds(stores, input.brandLabel);
  const filterKey = storeParam === "all" || stores.some((s) => s.id === storeParam) ? storeParam! : "";
  const storeFilter = filterKey === "all" ? stores.map((s) => s.id) : filterKey ? [filterKey] : defaultStores;
  const members = staffForStores(activeStaff, schedule, storeFilter, { includeIdle: true, chosenStores });
  const inFilter = new Set(storeFilter);
  const homeCount = activeStaff.filter((s) => inFilter.has(s.storeId)).length;
  const chosenOnly = members.filter((s) => !inFilter.has(s.storeId) && choseAnyStore(chosenStores, s.id, inFilter));
  return {
    filterKey,
    storeFilter,
    defaultStores,
    members,
    memberIds: new Set(members.map((s) => s.id)),
    homeCount,
    chosenOnly,
  };
}

/** 業態のラベル（店舗の既定の絞り込みに使う） */
export async function currentBrandLabel(): Promise<string> {
  return BRAND_INFO[(await getBrand()) ?? "eni"].label;
}

/** 表に出ているスタッフのシフト表の状態（ほかの業態の人の行は見ない） */
export function viewStatus(assignments: ShiftAssignment[], memberIds: Set<string>): ShiftStatus {
  return shiftStatusOf(assignments.filter((a) => memberIds.has(a.staffId)));
}
