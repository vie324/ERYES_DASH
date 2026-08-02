"use client";

// 希望休のタップ式カレンダー。日をタップして選択→「この内容で申請する」で保存。
// 選択済みの日は選択解除もできる（保存で丸ごと入れ替わる）。

import { useState } from "react";
import { datesOfMonth, weekdayJa, weekdayOf } from "@/lib/date";
import { saveDayoffRequestsAction } from "./actions";

export function DayoffCalendar({
  month,
  initialSelected,
  editable,
}: {
  month: string; // "YYYY-MM"
  initialSelected: string[];
  editable: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  const dates = datesOfMonth(month);
  const firstWeekday = weekdayOf(dates[0]);

  const toggle = (date: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <form action={saveDayoffRequestsAction} className="card">
      <input type="hidden" name="target_month" value={month} />
      <input type="hidden" name="dates" value={JSON.stringify([...selected].sort())} />

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-500 mb-1">
        {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
          <div key={w} className={i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : ""}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {dates.map((date) => {
          const wd = weekdayOf(date);
          const isSelected = selected.has(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => toggle(date)}
              disabled={!editable}
              aria-pressed={isSelected}
              aria-label={`${date}（${weekdayJa(wd)}）を希望休に${isSelected ? "しない" : "する"}`}
              className={`aspect-square rounded-xl border text-sm font-bold transition-colors ${
                isSelected
                  ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                  : `bg-white border-ink-200 ${
                      wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-ink-700"
                    } ${editable ? "active:bg-brand-50" : "opacity-60"}`
              }`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>

      <p className="text-sm font-bold text-ink-600 mt-3">
        選択中：{selected.size}日
        {selected.size > 0 && (
          <span className="block text-xs font-normal text-ink-500 mt-1">
            {[...selected]
              .sort()
              .map((d) => `${Number(d.slice(8))}日`)
              .join("、")}
          </span>
        )}
      </p>

      {editable && (
        <button type="submit" className="btn-primary w-full text-lg mt-3">
          この内容で申請する（上書き保存）
        </button>
      )}
    </form>
  );
}
