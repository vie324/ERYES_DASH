// シフト関連の表示ラベル・配色（スタッフ画面・管理者画面で共用）

import type { ShiftPreference, ShiftType } from "@/lib/data/types";

export const PREFERENCE_LABEL: Record<ShiftPreference, string> = {
  early: "早番",
  late: "遅番",
  off: "休み",
};

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  early: "早",
  late: "遅",
};

/** カレンダーセル・バッジの配色（指定なし含む） */
export const PREFERENCE_CLASS: Record<ShiftPreference | "none", string> = {
  none: "bg-white text-stone-400 border-stone-200",
  early: "bg-sky-100 text-sky-700 border-sky-300",
  late: "bg-indigo-100 text-indigo-700 border-indigo-300",
  off: "bg-rose-100 text-rose-600 border-rose-300",
};

export const SHIFT_TYPE_CLASS: Record<ShiftType, string> = {
  early: "bg-sky-100 text-sky-700",
  late: "bg-indigo-100 text-indigo-700",
};
