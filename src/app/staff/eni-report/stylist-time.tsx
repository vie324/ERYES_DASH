"use client";

// スタイリスト日報の「客数・入客時間・次回予約」の入力。
// 稼働率（入客時間 ÷ 段数×8時間）と次回予約率（次回予約 ÷ 客数）はその場で自動計算して大きく見せる。
// 段数（同時に回す席数）はスタッフマスタの値。ここでは変えられず、分母の説明として表示する。
// 稼働率は任意ではなく必須（入客時間を入れないと保存できない）。
// 入客時間は画面では「時間」で入力してもらい、保存時に分へ直す（保存形式は従来どおり分）。

import { useState } from "react";
import { capacityMinutes, computeStylistCalc, minutesToHours, normalizeTiers } from "@/lib/eni/forms";

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
  required,
  decimal,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  /** "any" なら小数を自由に入れられる（時間入力で 6.3 などを弾かないため） */
  step?: number | "any";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** スマホで小数点を打てるキーボードにする */
  decimal?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-bold mb-1.5 text-ink-600" htmlFor={name}>
        {label}
        {required && <span className="text-red-500 text-xs font-bold ml-1">必須</span>}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
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

/** %の大きな表示（バー付き）。稼働率・次回予約率で共用 */
function RateDisplay({
  label,
  rate,
  sub,
  goodFrom,
}: {
  label: string;
  rate: number | null;
  sub: string;
  /** この%以上なら緑で表示 */
  goodFrom: number;
}) {
  const tone =
    rate === null
      ? "text-ink-400"
      : rate >= goodFrom
        ? "text-emerald-600"
        : rate >= goodFrom * 0.6
          ? "text-brand-700"
          : "text-red-500";
  const barTone =
    rate === null
      ? "bg-ink-200"
      : rate >= goodFrom
        ? "bg-emerald-500"
        : rate >= goodFrom * 0.6
          ? "bg-brand-500"
          : "bg-red-400";
  return (
    <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-ink-500">{label}</span>
        <span className={`font-display text-2xl font-bold ${tone}`}>
          {rate === null ? "—" : `${rate}%`}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barTone}`}
          style={{ width: `${Math.min(100, Math.max(0, rate ?? 0))}%` }}
        />
      </div>
      <p className="text-[11px] text-ink-400 mt-1.5">{sub}</p>
    </div>
  );
}

export function StylistTimeSummary({
  initialClientCount,
  initialServiceMinutes,
  initialNextBookings,
  tiers,
}: {
  initialClientCount: number;
  initialServiceMinutes: number;
  initialNextBookings: number;
  /** 段数（マスタ設定の「一人当たり同時に回す席数」） */
  tiers: number;
}) {
  const num = (v: number) => (v > 0 ? String(v) : "");
  const [clientCount, setClientCount] = useState(num(initialClientCount));
  // 入客時間は「時間」で入力してもらう（分だと分かりにくいという現場の声）。保存は従来どおり分。
  const [serviceHours, setServiceHours] = useState(num(minutesToHours(initialServiceMinutes)));
  const [nextBookings, setNextBookings] = useState(num(initialNextBookings));

  const n = (v: string) => Math.max(0, Number(v) || 0);
  const serviceMinutes = Math.round(n(serviceHours) * 60);
  const myTiers = normalizeTiers(tiers);
  const capacity = capacityMinutes(myTiers);
  const capacityLabel = `${myTiers}段 × 8時間 ＝ ${capacity / 60}時間`;
  const calc = computeStylistCalc({
    clientCount: n(clientCount),
    serviceMinutes,
    nextBookings: n(nextBookings),
    tiers: myTiers,
  });

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="section-title !mb-0">今日の入客（稼働率・次回予約率は自動計算）</p>
        <span className="chip !py-1 !px-3 !min-h-0 border-brand-300 text-brand-700">
          段数 {myTiers}段
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          name="client_count"
          label="今日の客数"
          value={clientCount}
          onChange={setClientCount}
          unit="人"
          step={1}
          placeholder="8"
          required
        />
        <NumberField
          name="next_bookings"
          label="次回予約が取れた数"
          value={nextBookings}
          onChange={setNextBookings}
          unit="件"
          step={1}
          placeholder="5"
        />
      </div>

      <NumberField
        name="service_hours"
        label="入客時間の合計"
        value={serviceHours}
        onChange={setServiceHours}
        unit="時間"
        step="any"
        decimal
        placeholder="6"
        hint={`回せる枠 ${capacityLabel} のうち、お客様に入っていた時間の合計（30分は 0.5 と入れてOK）`}
        required
      />
      {/* 保存は従来どおり分で行う（過去データ・稼働率の計算と揃えるため） */}
      <input type="hidden" name="service_minutes" value={serviceHours === "" ? "" : String(serviceMinutes)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RateDisplay
          label="稼働率"
          rate={serviceHours === "" ? null : calc.utilization}
          sub={`入客時間 ÷（${capacityLabel}）で自動計算`}
          goodFrom={70}
        />
        <RateDisplay
          label="次回予約率"
          rate={calc.rebookRate}
          sub="次回予約が取れた数 ÷ 客数で自動計算"
          goodFrom={50}
        />
      </div>
    </div>
  );
}
