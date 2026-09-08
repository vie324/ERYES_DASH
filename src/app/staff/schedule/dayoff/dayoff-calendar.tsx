"use client";

// 希望休のタップ式カレンダー。日をタップして選択→「この内容で申請する」で保存。
// 選択した日には理由（ひとこと）と「有休」のチェックを付けられる。
//  ・理由は、同じ日に希望が重なったときにどちらを優先するかの判断材料になる
//  ・スタイリストの有休は、休み希望と同時にここで申請する

import { useMemo, useState } from "react";
import { datesOfMonth, weekdayJa, weekdayOf } from "@/lib/date";
import type { DayoffInput } from "@/lib/data/types";
import { saveDayoffRequestsAction } from "./actions";

export function DayoffCalendar({
  month,
  initialSelected,
  editable,
  isStylist,
}: {
  month: string; // "YYYY-MM"
  initialSelected: DayoffInput[];
  editable: boolean;
  /** スタイリスト（有休の案内を強めに出す） */
  isStylist: boolean;
}) {
  const [selected, setSelected] = useState<Map<string, Omit<DayoffInput, "date">>>(
    new Map(initialSelected.map((d) => [d.date, { reason: d.reason, paidLeave: d.paidLeave }]))
  );

  const dates = datesOfMonth(month);
  const firstWeekday = weekdayOf(dates[0]);

  const toggle = (date: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(date)) next.delete(date);
      else next.set(date, { reason: "", paidLeave: false });
      return next;
    });
  };

  const patch = (date: string, p: Partial<Omit<DayoffInput, "date">>) => {
    if (!editable) return;
    setSelected((prev) => {
      const cur = prev.get(date);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(date, { ...cur, ...p });
      return next;
    });
  };

  const selectedDates = useMemo(() => [...selected.keys()].sort(), [selected]);
  const payload: DayoffInput[] = selectedDates.map((date) => ({ date, ...selected.get(date)! }));

  return (
    <form action={saveDayoffRequestsAction} className="space-y-4">
      <input type="hidden" name="target_month" value={month} />
      <input type="hidden" name="dates" value={JSON.stringify(payload)} />

      <div className="card">
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
            const paid = selected.get(date)?.paidLeave;
            return (
              <button
                key={date}
                type="button"
                onClick={() => toggle(date)}
                disabled={!editable}
                aria-pressed={isSelected}
                aria-label={`${date}（${weekdayJa(wd)}）を希望休に${isSelected ? "しない" : "する"}`}
                className={`aspect-square rounded-xl border text-sm font-bold transition-colors flex flex-col items-center justify-center ${
                  isSelected
                    ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                    : `bg-white border-ink-200 ${
                        wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-ink-700"
                      } ${editable ? "active:bg-brand-50" : "opacity-60"}`
                }`}
              >
                {Number(date.slice(8))}
                {isSelected && <span className="text-[9px] font-bold leading-none mt-0.5">{paid ? "有休" : "休"}</span>}
              </button>
            );
          })}
        </div>

        <p className="text-sm font-bold text-ink-600 mt-3">
          選択中：{selected.size}日
          {selected.size > 0 && (
            <span className="block text-xs font-normal text-ink-500 mt-1">
              {selectedDates.map((d) => `${Number(d.slice(8))}日`).join("、")}
            </span>
          )}
        </p>
      </div>

      {/* 理由・有休（選んだ日だけ並ぶ） */}
      {selectedDates.length > 0 && (
        <div className="card">
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
            {selectedDates.map((date) => {
              const d = selected.get(date)!;
              const wd = weekdayOf(date);
              return (
                <div key={date} className="flex items-center gap-2 py-2">
                  <span
                    className={`w-16 shrink-0 text-sm font-bold ${
                      wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-ink-700"
                    }`}
                  >
                    {Number(date.slice(8))}日({weekdayJa(wd)})
                  </span>
                  <input
                    type="text"
                    value={d.reason}
                    onChange={(e) => patch(date, { reason: e.target.value })}
                    disabled={!editable}
                    maxLength={100}
                    placeholder="理由（例：通院）"
                    aria-label={`${Number(date.slice(8))}日の希望休の理由`}
                    className="input !min-h-10 !py-2 text-sm flex-1 min-w-0"
                  />
                  <label className="flex items-center gap-1 text-xs font-bold text-ink-700 shrink-0">
                    <input
                      type="checkbox"
                      checked={d.paidLeave}
                      onChange={(e) => patch(date, { paidLeave: e.target.checked })}
                      disabled={!editable}
                      className="h-5 w-5 accent-brand-500"
                    />
                    有休
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editable && (
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full text-lg">
            この内容で申請する（上書き保存）
          </button>
        </div>
      )}
    </form>
  );
}
