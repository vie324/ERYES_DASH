"use client";

// シフト希望の入力フォーム。
// カレンダーの日をタップするたびに 指定なし → 早番 → 遅番 → 休み → 指定なし と切り替わる。
// 「指定なし」の日は早番・遅番どちらでも勤務できる扱いになる（覚えることを最小限に）。

import { useMemo, useState } from "react";
import { datesOfMonth, weekdayJa, weekdayOf } from "@/lib/date";
import { PREFERENCE_CLASS, PREFERENCE_LABEL } from "@/lib/shift/labels";
import type { ShiftPreference } from "@/lib/data/types";
import { saveShiftRequestAction } from "./actions";

type CellState = ShiftPreference | "none";
const CYCLE: CellState[] = ["none", "early", "late", "off"];

export function ShiftRequestForm({
  targetMonth,
  stores,
  initialDays,
  initialStoreIds,
  initialNote,
  editable,
}: {
  targetMonth: string;
  stores: { id: string; name: string }[];
  initialDays: Record<string, ShiftPreference>;
  initialStoreIds: string[];
  initialNote: string;
  editable: boolean;
}) {
  const [days, setDays] = useState<Record<string, ShiftPreference>>(initialDays);
  const [storeIds, setStoreIds] = useState<Set<string>>(new Set(initialStoreIds));

  const dates = useMemo(() => datesOfMonth(targetMonth), [targetMonth]);
  const leadingBlanks = weekdayOf(dates[0]); // 日曜始まりカレンダーの先頭空白数

  const cycleDay = (date: string) => {
    if (!editable) return;
    setDays((prev) => {
      const current: CellState = prev[date] ?? "none";
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
      const updated = { ...prev };
      if (next === "none") delete updated[date];
      else updated[date] = next;
      return updated;
    });
  };

  const toggleStore = (id: string) => {
    if (!editable) return;
    setStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c = { early: 0, late: 0, off: 0 };
    for (const pref of Object.values(days)) c[pref]++;
    return c;
  }, [days]);

  return (
    <form action={saveShiftRequestAction} className="space-y-4">
      <input type="hidden" name="target_month" value={targetMonth} />
      <input type="hidden" name="days_json" value={JSON.stringify(days)} />

      <section className="card">
        <p className="font-bold text-sm text-stone-500 mb-1">日ごとの希望</p>
        <p className="text-xs text-stone-400 mb-3">
          日付をタップするたびに「指定なし → 早番 → 遅番 → 休み」と切り替わります。
          指定なしの日は早番・遅番どちらでも入れる扱いです。
        </p>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-stone-400 mb-1">
          {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
            <div key={w} className={w === "日" ? "text-red-400" : w === "土" ? "text-sky-400" : ""}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {dates.map((date) => {
            const state = (days[date] ?? "none") as CellState;
            const day = Number(date.slice(8));
            return (
              <button
                key={date}
                type="button"
                onClick={() => cycleDay(date)}
                disabled={!editable}
                className={`rounded-lg border min-h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${PREFERENCE_CLASS[state]} ${editable ? "active:scale-95" : "opacity-80"}`}
                aria-label={`${day}日 ${state === "none" ? "指定なし" : PREFERENCE_LABEL[state]}`}
              >
                <span className="text-sm font-bold">{day}</span>
                <span className="text-[10px] font-bold leading-none">
                  {state === "none" ? "−" : PREFERENCE_LABEL[state]}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-stone-500 mt-3">
          休み希望 <span className="font-bold text-brand-700">{counts.off}日</span>
          ／ 早番希望 <span className="font-bold text-sky-600">{counts.early}日</span>
          ／ 遅番希望 <span className="font-bold text-indigo-600">{counts.late}日</span>
        </p>
      </section>

      <section className="card">
        <p className="font-bold text-sm text-stone-500 mb-1">この月に勤務できる店舗（複数選択可）</p>
        <p className="text-xs text-stone-400 mb-3">選んだ店舗にだけシフトが組まれます。</p>
        <div className="space-y-2">
          {stores.map((store) => {
            const checked = storeIds.has(store.id);
            return (
              <label
                key={store.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-base font-bold ${
                  checked ? "border-brand-400 bg-brand-50 text-brand-800" : "border-stone-200 text-stone-600"
                }`}
              >
                <input
                  type="checkbox"
                  name="store_ids"
                  value={store.id}
                  checked={checked}
                  onChange={() => toggleStore(store.id)}
                  disabled={!editable}
                  className="h-5 w-5 accent-brand-500 shrink-0"
                />
                {store.name}
              </label>
            );
          })}
        </div>
      </section>

      <section className="card">
        <label className="label" htmlFor="note">
          備考（任意）
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          defaultValue={initialNote}
          disabled={!editable}
          placeholder="例）20日は通院のため午前のみ可です"
          className="input min-h-24"
        />
      </section>

      {editable && (
        <button type="submit" className="btn-primary w-full text-lg">
          この内容で提出する
        </button>
      )}
    </form>
  );
}
