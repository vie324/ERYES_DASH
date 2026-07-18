"use client";

// 予約表風のタイムテーブル入力。時間の行ごとに「内容」を入れる。
// 内容は datalist で「MTG」「練習」などの登録済み項目から選べて、手入力も可能。
// 入力結果は hidden input（name）に JSON（[{t,a}]）で入る。

import { useMemo, useState } from "react";

export interface TimeRow {
  t: string; // "10:00"
  a: string; // 内容
}

function buildSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

export function TimetableGrid({
  name,
  initial,
  presets,
  startHour = 8,
  endHour = 22,
  listId = "tt-presets",
}: {
  name: string;
  initial: TimeRow[];
  presets: string[];
  startHour?: number;
  endHour?: number;
  listId?: string;
}) {
  const slots = useMemo(() => buildSlots(startHour, endHour), [startHour, endHour]);
  const initialMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of initial) m[r.t] = r.a;
    return m;
  }, [initial]);
  const [values, setValues] = useState<Record<string, string>>(initialMap);

  const rows: TimeRow[] = slots.map((t) => ({ t, a: values[t] ?? "" })).filter((r) => r.a.trim() !== "");

  return (
    <div>
      <datalist id={listId}>
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="rounded-xl border border-stone-200 overflow-hidden">
        {slots.map((t, i) => (
          <div
            key={t}
            className={`flex items-stretch ${i > 0 ? "border-t border-stone-100" : ""}`}
          >
            <span className="w-14 shrink-0 flex items-center justify-center text-xs font-bold text-stone-400 bg-stone-50">
              {t}
            </span>
            <input
              type="text"
              list={listId}
              value={values[t] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [t]: e.target.value }))}
              placeholder="—"
              aria-label={`${t}の予定`}
              className="flex-1 min-h-11 px-3 text-sm outline-none focus:bg-brand-50/50"
            />
          </div>
        ))}
      </div>

      <input type="hidden" name={name} value={JSON.stringify(rows)} />
    </div>
  );
}

/** 保存済みのタイムテーブルを読み取り表示（縦の一覧） */
export function TimetableView({ rows }: { rows: TimeRow[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${i > 0 ? "border-t border-stone-100" : ""}`}>
          <span className="w-14 shrink-0 flex items-center justify-center text-xs font-bold text-stone-400 bg-stone-50 py-1.5">
            {r.t}
          </span>
          <span className="flex-1 px-3 py-1.5 text-sm text-ink-700">{r.a}</span>
        </div>
      ))}
    </div>
  );
}
