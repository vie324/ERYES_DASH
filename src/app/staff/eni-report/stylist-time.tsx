"use client";

// スタイリスト日報の「時間のまとめ」入力。
// お客様1人ずつの±を書くのは手間なので、その日の合計（早く終わった／オーバー）だけを本人が記入する。
// 合計±はその場で自動計算して見せる。稼働率は「施術時間の合計（任意）」を入れたときだけ出す。

import { useState } from "react";
import { computeStylistCalc } from "@/lib/eni/forms";

/** 数値入力（未入力は空欄のまま扱う） */
function NumberField({
  name,
  label,
  value,
  onChange,
  unit,
  step = 5,
  placeholder,
  hint,
  tone = "default",
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  step?: number;
  placeholder?: string;
  hint?: string;
  tone?: "default" | "good" | "over";
}) {
  const labelColor =
    tone === "good" ? "text-emerald-700" : tone === "over" ? "text-red-600" : "text-ink-600";
  return (
    <div>
      <label className={`block text-sm font-bold mb-1.5 ${labelColor}`} htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input text-right font-bold pr-10"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-400">
          {unit}
        </span>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function StylistTimeSummary({
  initialClientCount,
  initialMinutesEarly,
  initialMinutesOver,
  initialWorkMinutes,
  initialServiceMinutes,
  defaultWorkMinutes,
}: {
  initialClientCount: number;
  initialMinutesEarly: number;
  initialMinutesOver: number;
  initialWorkMinutes: number;
  initialServiceMinutes: number;
  /** シフトから割り出した今日の勤務時間（分） */
  defaultWorkMinutes: number;
}) {
  const num = (v: number) => (v > 0 ? String(v) : "");
  const [clientCount, setClientCount] = useState(num(initialClientCount));
  const [early, setEarly] = useState(num(initialMinutesEarly));
  const [over, setOver] = useState(num(initialMinutesOver));
  const [workMinutes, setWorkMinutes] = useState(
    num(initialWorkMinutes) || num(defaultWorkMinutes)
  );
  const [serviceMinutes, setServiceMinutes] = useState(num(initialServiceMinutes));

  const n = (v: string) => Math.max(0, Number(v) || 0);
  const calc = computeStylistCalc({
    clientCount: n(clientCount),
    minutesEarly: n(early),
    minutesOver: n(over),
    workMinutes: n(workMinutes),
    serviceMinutes: n(serviceMinutes),
  });

  const diffLabel =
    calc.timeDiff === 0
      ? "±0分"
      : calc.timeDiff > 0
        ? `+${calc.timeDiff}分（予定よりオーバー）`
        : `${calc.timeDiff}分（予定より早い）`;

  return (
    <div className="card space-y-4">
      <p className="section-title !mb-0">今日の時間（まとめて入力）</p>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          name="client_count"
          label="今日の客数"
          value={clientCount}
          onChange={setClientCount}
          unit="人"
          step={1}
          placeholder="8"
        />
        <NumberField
          name="work_minutes"
          label="今日の勤務時間"
          value={workMinutes}
          onChange={setWorkMinutes}
          unit="分"
          step={30}
          placeholder="480"
          hint="シフトがあれば自動で入ります"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          name="minutes_early"
          label="早く終わった時間"
          value={early}
          onChange={setEarly}
          unit="分"
          tone="good"
          placeholder="20"
          hint="今日の合計"
        />
        <NumberField
          name="minutes_over"
          label="オーバーした時間"
          value={over}
          onChange={setOver}
          unit="分"
          tone="over"
          placeholder="15"
          hint="今日の合計"
        />
      </div>

      {/* 合計±（その場で自動計算） */}
      <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-ink-500">施術時間の合計±</span>
        <span
          className={`font-display text-lg font-bold ${
            calc.timeDiff > 0
              ? "text-red-600"
              : calc.timeDiff < 0
                ? "text-emerald-700"
                : "text-ink-900"
          }`}
        >
          {diffLabel}
        </span>
      </div>

      {/* 稼働率を出したいときだけ（任意） */}
      <details className="rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5 group">
        <summary className="text-sm font-bold text-brand-700 cursor-pointer list-none flex items-center justify-between">
          稼働率も出す（任意）
          <span className="text-brand-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3">
          <NumberField
            name="service_minutes"
            label="今日の施術時間の合計"
            value={serviceMinutes}
            onChange={setServiceMinutes}
            unit="分"
            step={30}
            placeholder="360"
            hint="入れたときだけ稼働率を計算します（空欄でもOK）"
          />
          {calc.utilization !== null ? (
            <p className="mt-2 text-sm font-bold text-ink-700">
              稼働率：<span className="font-display text-lg text-brand-700">{calc.utilization}%</span>
              <span className="block text-[11px] font-normal text-ink-400 mt-0.5">
                （施術時間の合計 − 客数×60分）÷ 勤務時間。1人あたり前後30分は受付・仕上げぶんとして除いています
              </span>
            </p>
          ) : (
            n(serviceMinutes) > 0 &&
            n(workMinutes) === 0 && (
              <p className="mt-2 text-xs font-bold text-amber-700">
                上の「今日の勤務時間」も入れると稼働率が出ます
              </p>
            )
          )}
        </div>
      </details>
    </div>
  );
}
