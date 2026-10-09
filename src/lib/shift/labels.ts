// シフト関連の表示ラベル・配色（スタッフ画面・管理者画面で共用）

/** 店舗ごとの色（店舗の並び順で決める。2店舗以上のときだけ使う） */
const STORE_COLORS = [
  { chip: "bg-sky-100 text-sky-800 border-sky-200", dot: "bg-sky-400" },
  { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-400" },
  { chip: "bg-violet-100 text-violet-800 border-violet-200", dot: "bg-violet-400" },
  { chip: "bg-amber-100 text-amber-900 border-amber-200", dot: "bg-amber-400" },
  { chip: "bg-rose-100 text-rose-800 border-rose-200", dot: "bg-rose-400" },
  { chip: "bg-teal-100 text-teal-800 border-teal-200", dot: "bg-teal-400" },
];

export function storeColor(index: number): { chip: string; dot: string } {
  return STORE_COLORS[((index % STORE_COLORS.length) + STORE_COLORS.length) % STORE_COLORS.length];
}

/** 土日の文字色（0=日・6=土） */
export function weekdayTextClass(weekday: number): string {
  return weekday === 0 ? "text-red-500" : weekday === 6 ? "text-sky-600" : "text-ink-700";
}
