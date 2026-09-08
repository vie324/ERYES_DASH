"use client";

// シフト希望（希望休）の入力フォーム。
// カレンダーの日をタップするたびに 指定なし ⇄ 休み が切り替わる。
// 休みにした日は下に並び、理由（ひとこと）と「有休」のチェックを付けられる。
//  ・理由は、同じ日に希望が重なったときにどちらを優先するかの判断材料になる
//  ・スタイリストの有休は、休み希望と同時にここで申請する

import { useMemo, useState } from "react";
import { datesOfMonth, weekdayJa, weekdayOf } from "@/lib/date";
import { PREFERENCE_CLASS, PREFERENCE_LABEL } from "@/lib/shift/labels";
import type { ShiftDayRequest, ShiftPreference } from "@/lib/data/types";
import { saveShiftRequestAction } from "./actions";

type CellState = ShiftPreference | "none";

export function ShiftRequestForm({
  targetMonth,
  stores,
  initialDays,
  initialStoreIds,
  initialNote,
  editable,
  isStylist,
}: {
  targetMonth: string;
  stores: { id: string; name: string }[];
  initialDays: Record<string, ShiftDayRequest>;
  initialStoreIds: string[];
  initialNote: string;
  editable: boolean;
  /** スタイリスト（有休の案内を強めに出す） */
  isStylist: boolean;
}) {
  const [days, setDays] = useState<Record<string, ShiftDayRequest>>(initialDays);
  const [storeIds, setStoreIds] = useState<Set<string>>(new Set(initialStoreIds));

  const dates = useMemo(() => datesOfMonth(targetMonth), [targetMonth]);
  const leadingBlanks = weekdayOf(dates[0]); // 日曜始まりカレンダーの先頭空白数

  const cycleDay = (date: string) => {
    if (!editable) return;
    setDays((prev) => {
      const updated = { ...prev };
      // 「休み」だけのトグル。旧データに早番・遅番が残っていてもタップで「休み」に整理される
      if (updated[date]?.preference === "off") delete updated[date];
      else updated[date] = { preference: "off", reason: "", paidLeave: false };
      return updated;
    });
  };

  const patchDay = (date: string, patch: Partial<ShiftDayRequest>) => {
    if (!editable) return;
    setDays((prev) => (prev[date] ? { ...prev, [date]: { ...prev[date], ...patch } } : prev));
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

  const offDates = useMemo(
    () =>
      Object.entries(days)
        .filter(([, d]) => d.preference === "off")
        .map(([date]) => date)
        .sort(),
    [days]
  );
  const paidCount = offDates.filter((d) => days[d].paidLeave).length;

  return (
    <form action={saveShiftRequestAction} className="space-y-4">
      <input type="hidden" name="target_month" value={targetMonth} />
      <input type="hidden" name="days_json" value={JSON.stringify(days)} />

      <section className="card">
        <p className="section-title !mb-1.5">休みたい日（希望休）</p>
        <p className="text-xs text-ink-400 mb-3">
          休みたい日をタップして選びます（もう一度タップで取り消し）。
          選んでいない日は勤務できる扱いです。
        </p>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-400 mb-1">
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
            const state = (days[date]?.preference ?? "none") as CellState;
            const day = Number(date.slice(8));
            const paid = days[date]?.paidLeave;
            return (
              <button
                key={date}
                type="button"
                onClick={() => cycleDay(date)}
                disabled={!editable}
                className={`rounded-lg border min-h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${PREFERENCE_CLASS[state]} ${editable ? "active:scale-95" : "opacity-80"}`}
                aria-label={`${day}日 ${state === "none" ? "指定なし" : PREFERENCE_LABEL[state]}${paid ? "（有休）" : ""}`}
              >
                <span className="text-sm font-bold">{day}</span>
                <span className="text-[10px] font-bold leading-none">
                  {state === "none" ? "−" : paid ? "有休" : PREFERENCE_LABEL[state]}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-ink-500 mt-3">
          休み希望 <span className="font-bold text-brand-700">{offDates.length}日</span>
          {paidCount > 0 && (
            <span className="ml-2">
              うち有休 <span className="font-bold text-brand-700">{paidCount}日</span>
            </span>
          )}
        </p>
      </section>

      {/* 休み希望の理由・有休（休みにした日だけ並ぶ） */}
      {offDates.length > 0 && (
        <section className="card">
          <p className="section-title !mb-1.5">休み希望の理由・有休</p>
          <p className="text-xs text-ink-400 mb-1">
            理由を書いてもらうのは、同じ日に休み希望が重なったときに、どちらを優先するかを判断する材料にするためです。
            ひとことで大丈夫です（例：友人の結婚式、通院、家族の予定）。
          </p>
          <p className={`text-xs mb-3 ${isStylist ? "font-bold text-brand-800" : "text-ink-400"}`}>
            有休で休みたい日は「有休」にチェックしてください。
            {isStylist ? "スタイリストの有休は、休み希望と同時にここで申請します。" : ""}
          </p>
          <div className="divide-y divide-ink-100">
            {offDates.map((date) => {
              const d = days[date];
              const wd = weekdayOf(date);
              return (
                <div key={date} className="flex items-center gap-2 py-2">
                  <span
                    className={`w-16 shrink-0 text-sm font-bold ${
                      wd === 0 ? "text-red-400" : wd === 6 ? "text-sky-500" : "text-ink-700"
                    }`}
                  >
                    {Number(date.slice(8))}日({weekdayJa(wd)})
                  </span>
                  <input
                    type="text"
                    value={d.reason}
                    onChange={(e) => patchDay(date, { reason: e.target.value })}
                    disabled={!editable}
                    maxLength={100}
                    placeholder="理由（例：通院）"
                    aria-label={`${Number(date.slice(8))}日の休み希望の理由`}
                    className="input !min-h-10 !py-2 text-sm flex-1 min-w-0"
                  />
                  <label className="flex items-center gap-1 text-xs font-bold text-ink-700 shrink-0">
                    <input
                      type="checkbox"
                      checked={d.paidLeave}
                      onChange={(e) => patchDay(date, { paidLeave: e.target.checked })}
                      disabled={!editable}
                      className="h-5 w-5 accent-brand-500"
                    />
                    有休
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <p className="section-title !mb-1.5">この月に勤務できる店舗（複数選択可）</p>
        <p className="text-xs text-ink-400 mb-3">選んだ店舗にだけシフトが組まれます。</p>
        <div className="space-y-2">
          {stores.map((store) => {
            const checked = storeIds.has(store.id);
            return (
              <label
                key={store.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-base font-bold ${
                  checked ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600"
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
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full text-lg">
            この内容で提出する
          </button>
        </div>
      )}
    </form>
  );
}
