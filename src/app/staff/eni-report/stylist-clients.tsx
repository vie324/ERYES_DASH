"use client";

// スタイリスト日報の「来店ごとの時間」入力。予約（約束）時間と実施術時間を入れると、
// 稼働率と施術時間の±がその場で自動計算される（本人は計算しなくてよい）。

import { useState } from "react";
import { computeStylistCalc, type ClientEntry } from "@/lib/eni/forms";

interface Row {
  booked: string;
  actual: string;
}

export function StylistClients({
  initialClients,
  initialWorkMinutes,
  defaultWorkMinutes,
}: {
  initialClients: ClientEntry[];
  initialWorkMinutes: number;
  defaultWorkMinutes: number;
}) {
  const [rows, setRows] = useState<Row[]>(
    initialClients.length > 0
      ? initialClients.map((c) => ({ booked: String(c.booked || ""), actual: String(c.actual || "") }))
      : [{ booked: "", actual: "" }]
  );
  const [workMinutes, setWorkMinutes] = useState<string>(
    String(initialWorkMinutes || defaultWorkMinutes || "")
  );

  const entries: ClientEntry[] = rows.map((r) => ({
    booked: Number(r.booked) || 0,
    actual: Number(r.actual) || 0,
  }));
  const calc = computeStylistCalc(entries, Number(workMinutes) || 0);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { booked: "", actual: "" }]);
  const removeRow = (i: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const diffLabel =
    calc.timeDiff === 0
      ? "±0分"
      : calc.timeDiff > 0
        ? `+${calc.timeDiff}分（予定より遅い）`
        : `${calc.timeDiff}分（予定より早い）`;

  return (
    <div className="card space-y-3">
      <p className="section-title !mb-0">来店ごとの時間（稼働率・施術時間の自動計算）</p>

      {/* 集計サマリー */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-brand-50 border border-brand-100 py-2">
          <p className="text-[11px] font-bold text-ink-500">客数</p>
          <p className="font-display text-lg font-bold text-ink-900">{calc.clientCount}</p>
        </div>
        <div className="rounded-xl bg-brand-50 border border-brand-100 py-2">
          <p className="text-[11px] font-bold text-ink-500">稼働率</p>
          <p className="font-display text-lg font-bold text-brand-700">{calc.utilization}%</p>
        </div>
        <div className="rounded-xl bg-brand-50 border border-brand-100 py-2">
          <p className="text-[11px] font-bold text-ink-500">施術時間の合計±</p>
          <p
            className={`font-display text-sm font-bold ${
              calc.timeDiff > 0 ? "text-red-500" : calc.timeDiff < 0 ? "text-emerald-600" : "text-ink-900"
            }`}
          >
            {diffLabel}
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="work_minutes_input">
          今日の勤務時間（分）
        </label>
        <input
          id="work_minutes_input"
          type="number"
          inputMode="numeric"
          min={0}
          step={30}
          value={workMinutes}
          onChange={(e) => setWorkMinutes(e.target.value)}
          className="input text-right font-bold"
          placeholder="例）480（8時間）"
        />
      </div>

      {/* 来店行 */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1.2rem_1fr_1fr_1.5rem] gap-2 items-center text-[11px] font-bold text-ink-400 px-0.5">
          <span></span>
          <span>予約時間(分)</span>
          <span>実施術(分)</span>
          <span></span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1.2rem_1fr_1fr_1.5rem] gap-2 items-center">
            <span className="text-xs font-bold text-ink-400 text-center">{i + 1}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={r.booked}
              onChange={(e) => setRow(i, { booked: e.target.value })}
              className="input !min-h-10 !py-1.5 text-right"
              placeholder="90"
              aria-label={`${i + 1}人目の予約時間`}
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={r.actual}
              onChange={(e) => setRow(i, { actual: e.target.value })}
              className="input !min-h-10 !py-1.5 text-right"
              placeholder="85"
              aria-label={`${i + 1}人目の実施術時間`}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="この行を削除"
              className="text-ink-300 hover:text-red-500 font-bold"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-xl border-2 border-dashed border-brand-300 py-2 text-sm font-bold text-brand-600"
      >
        ＋ 来店を追加
      </button>

      <p className="text-[11px] text-ink-400">
        稼働率＝各予約の前後30分（受付・仕上げ・お会計＝アシスタント対応分）を除いた時間 ÷ 勤務時間
      </p>

      {/* サーバー送信用（JSON） */}
      <input type="hidden" name="clients_json" value={JSON.stringify(entries)} />
      <input type="hidden" name="work_minutes" value={String(Number(workMinutes) || 0)} />
    </div>
  );
}
