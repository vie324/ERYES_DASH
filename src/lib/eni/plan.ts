// 「スケジュール」画面の共通ロジック（サーバーアクションからも画面からも使う純粋関数）。
// "use server" のファイルには非同期関数しか置けないため、定数・同期関数はここにまとめる。

import { addDays } from "@/lib/date";

/** 入力できる先の範囲：3ヶ月先まで（先の予定も立てられるようにする） */
export const PLAN_DAYS_AHEAD = 92;
/** さかのぼって見られる範囲 */
export const PLAN_DAYS_BEHIND = 180;

/** 日付の検証。形式違い・範囲外は今日に丸める */
export function normalizePlanDate(raw: string | undefined, today: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  if (raw < addDays(today, -PLAN_DAYS_BEHIND) || raw > addDays(today, PLAN_DAYS_AHEAD)) return today;
  return raw;
}

/** 日付選択の下限・上限（input[type=date] の min/max に使う） */
export function planDateBounds(today: string): { min: string; max: string } {
  return { min: addDays(today, -PLAN_DAYS_BEHIND), max: addDays(today, PLAN_DAYS_AHEAD) };
}
