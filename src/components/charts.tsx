// ダッシュボード用のチャート部品（外部ライブラリなし・サーバーコンポーネントで動くSVG）。
//
// 配色の考え方：
//  ・数量の比較／推移は「ブランドゴールドの1色相・濃淡（連続ランプ）」で表す（明度が単調なので誤読しにくい）
//  ・状態（良い/注意/危険）だけは予約色を使う。検証済み：#059669 / #f59e0b / #b91c1c
//  ・文字はインク色のみ。マークの色を文字には使わない
// マークの仕様：棒は最大24px・データ端だけ4px角丸・目盛りは1pxのソリッド・隣接は2pxの余白で分ける。

import type { ReactNode } from "react";

/** ブランドゴールドの連続ランプ（薄→濃）。明度が単調に下がることを確認済み */
export const RAMP = ["#e7ddc4", "#d5c6a0", "#c0ab7e", "#a99668", "#79684a"] as const;
/** 状態色（good / warning / critical）。必ずラベルと一緒に使う */
export const STATUS = { good: "#059669", warning: "#f59e0b", critical: "#b91c1c" } as const;

const GRID = "#e7ddc4"; // 目盛り線（サーフェスから1段だけ濃いグレー相当）

function yen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

/** 数字を短く（1.2万 など）。軸ラベル用 */
function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000) / 10}万`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}千`;
  return String(n);
}

// ---------------------------------------------------------------- スタットタイル

/** 単一の数字（＋前期比）。グラフにするほどでもない見出しの数字はこれで出す */
export function StatTile({
  label,
  value,
  unit,
  delta,
  sub,
  tone = "default",
  spark,
}: {
  label: string;
  value: string | number;
  unit?: string;
  /** 前期比（％）。プラスなら上向き */
  delta?: number | null;
  sub?: string;
  tone?: "default" | "accent" | "good" | "warning" | "critical";
  /** 小さな推移（スパークライン）用の数値列 */
  spark?: number[];
}) {
  const valueColor =
    tone === "accent"
      ? "text-brand-700"
      : tone === "good"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-amber-700"
          : tone === "critical"
            ? "text-red-700"
            : "text-ink-900";

  const accentBar =
    tone === "accent"
      ? "from-brand-400 to-brand-600"
      : tone === "good"
        ? "from-emerald-300 to-emerald-500"
        : tone === "warning"
          ? "from-amber-300 to-amber-500"
          : tone === "critical"
            ? "from-red-300 to-red-500"
            : "from-ink-200 to-ink-300";

  return (
    <div className="card relative overflow-hidden !p-3.5 flex flex-col justify-between animate-fade-up">
      <span className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accentBar}`} />
      <p className="text-[11px] font-bold text-ink-500 leading-tight">{label}</p>
      <div className="mt-1.5 flex items-end gap-1.5">
        <span className={`font-display text-2xl leading-none font-bold ${valueColor}`}>{value}</span>
        {unit && <span className="text-[11px] font-bold text-ink-500 mb-0.5">{unit}</span>}
        {delta !== undefined && delta !== null && (
          <span
            className={`ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold mb-0.5 ${
              delta > 0
                ? "text-emerald-700 bg-emerald-50"
                : delta < 0
                  ? "text-red-700 bg-red-50"
                  : "text-ink-500 bg-ink-50"
            }`}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "±"}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} />}
      {sub && <p className="text-[10px] text-ink-400 mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

/** スタットタイルに添える小さな推移線 */
function Sparkline({ values }: { values: number[] }) {
  const w = 100;
  const h = 22;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * (h - 3) - 1.5}`);
  const last = values.at(-1) ?? 0;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-1.5 overflow-visible" aria-hidden="true">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={RAMP[3]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chart-draw"
      />
      <circle
        cx={(values.length - 1) * step}
        cy={h - (last / max) * (h - 3) - 1.5}
        r={4}
        fill={RAMP[4]}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </svg>
  );
}

// ---------------------------------------------------------------- 縦棒（推移）

/** 推移（月次・週次）。直近だけ濃くして「今」を強調する */
export function ColumnChart({
  data,
  format = "number",
  height = 150,
}: {
  data: { label: string; value: number; hint?: string }[];
  format?: "number" | "yen" | "hour";
  height?: number;
}) {
  const peak = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || peak === 0) {
    // 全部0のときに目盛りだけ描いても読めないので、空の状態として出す
    return <p className="text-xs text-ink-500 py-6 sm:py-8 text-center">データがまだありません</p>;
  }
  const max = peak;
  // 棒は「枠の6割・最大44px」。画面幅が広がっても間延びせず、狭くても潰れない
  const barW = "min(2.75rem, 60%)";
  const slot = 100 / data.length;
  const fmt = (v: number) => (format === "yen" ? yen(v) : format === "hour" ? `${v}h` : String(v));

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* 目盛り（0・中間・最大）。1pxソリッドで控えめに */}
        {[0, 0.5, 1].map((r) => (
          <div
            key={r}
            className="absolute left-0 right-0 border-t"
            style={{ borderColor: GRID, bottom: `${r * 100}%` }}
          >
            <span className="absolute -top-2 right-0 text-[9px] text-ink-500 bg-white/80 px-0.5">
              {compact(Math.round(max * r))}
            </span>
          </div>
        ))}

        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const isLast = i === data.length - 1;
            const hRatio = d.value / max;
            return (
              <div
                key={`${d.label}-${i}`}
                className="flex flex-col items-center justify-end h-full group"
                style={{ width: `${slot}%` }}
                title={`${d.label}：${fmt(d.value)}${d.hint ? ` ／ ${d.hint}` : ""}`}
              >
                {/* 直近だけ値を出す（全部に数字を置かない） */}
                {isLast && d.value > 0 && (
                  <span className="text-[10px] font-bold text-ink-700 mb-0.5 whitespace-nowrap">
                    {fmt(d.value)}
                  </span>
                )}
                <div
                  className="chart-bar rounded-t transition-opacity group-hover:opacity-80"
                  style={{
                    width: barW,
                    height: `${Math.max(hRatio * 100, d.value > 0 ? 2 : 0)}%`,
                    background: isLast ? RAMP[4] : RAMP[2],
                    animationDelay: `${i * 45}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex mt-1.5">
        {data.map((d, i) => (
          <span
            key={`${d.label}-l-${i}`}
            className={`text-[10px] text-center ${i === data.length - 1 ? "font-bold text-ink-700" : "text-ink-500"}`}
            style={{ width: `${slot}%` }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 横棒（比較）

/** メンバー別などの比較。多い順に並べ、値は棒の先に置く */
export function HBarList({
  data,
  format = "number",
  emptyText = "データがまだありません",
}: {
  data: { name: string; value: number; note?: string }[];
  format?: "number" | "yen" | "hour" | "minute";
  emptyText?: string;
}) {
  const peak = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || peak === 0) {
    return <p className="text-xs text-ink-500 py-6 text-center">{emptyText}</p>;
  }
  const max = peak;
  const fmt = (v: number) =>
    format === "yen"
      ? yen(v)
      : format === "hour"
        ? `${v}h`
        : format === "minute"
          ? `${Math.floor(v / 60)}h${v % 60 ? String(v % 60).padStart(2, "0") : ""}`
          : String(v);

  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={`${d.name}-${i}`} className="flex items-center gap-2" title={`${d.name}：${fmt(d.value)}`}>
          <span className="w-16 shrink-0 text-[11px] font-bold text-ink-700 truncate">{d.name}</span>
          <span className="flex-1 h-5 relative">
            <span
              className="chart-bar-h absolute left-0 top-0 bottom-0 rounded-r"
              style={{
                width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`,
                background: i === 0 ? RAMP[4] : RAMP[2],
                animationDelay: `${i * 50}ms`,
              }}
            />
          </span>
          <span className="w-16 shrink-0 text-[11px] font-bold text-ink-700 text-right">{fmt(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- 構成（部分と全体）

/** 内訳（技術／オプション／物販 など）。凡例＋値を必ず出す */
export function CompositionBar({
  parts,
  format = "yen",
}: {
  parts: { label: string; value: number }[];
  format?: "number" | "yen" | "hour";
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const fmt = (v: number) =>
    format === "yen" ? yen(v) : format === "hour" ? `${Math.round(v * 10) / 10}h` : String(v);
  if (total === 0) {
    return <p className="text-xs text-ink-500 py-6 text-center">データがまだありません</p>;
  }

  return (
    <div>
      {/* 積み上げ：セグメントの間は2pxの余白で分ける */}
      <div className="flex gap-0.5 h-7 rounded-lg overflow-hidden">
        {parts.map((p, i) =>
          p.value > 0 ? (
            <div
              key={p.label}
              className="chart-bar-h h-full first:rounded-l-lg last:rounded-r-lg"
              style={{
                width: `${(p.value / total) * 100}%`,
                background: RAMP[Math.min(4, i + 2)],
                animationDelay: `${i * 60}ms`,
              }}
              title={`${p.label}：${fmt(p.value)}（${Math.round((p.value / total) * 100)}%）`}
            />
          ) : null
        )}
      </div>

      {/* 凡例（2系列以上は必ず出す）＋値 */}
      <ul className="mt-2.5 space-y-1">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: RAMP[Math.min(4, i + 2)] }}
            />
            <span className="text-ink-500">{p.label}</span>
            <span className="ml-auto font-bold text-ink-700">{fmt(p.value)}</span>
            <span className="w-9 text-right text-ink-500">
              {total > 0 ? Math.round((p.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- 達成率（1つの比率）

/** 提出率・達成率などの「上限に対する1つの比率」。リング表示 */
export function ProgressRing({
  value,
  total,
  label,
  sub,
  size = 108,
}: {
  value: number;
  total: number;
  label: string;
  sub?: string;
  size?: number;
}) {
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const pct = Math.round(ratio * 100);
  const r = size / 2 - 9;
  const circ = 2 * Math.PI * r;
  // 状態：8割以上=良い / 5割以上=注意 / それ未満=危険（数字とラベルを必ず添える）
  const color = ratio >= 0.8 ? STATUS.good : ratio >= 0.5 ? STATUS.warning : STATUS.critical;

  return (
    <div className="flex flex-col items-center" title={`${label}：${value} / ${total}（${pct}%）`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          className="chart-ring"
          style={{ ["--ring-circ" as string]: `${circ}` }}
        />
      </svg>
      <div className="-mt-[calc(50%+0.6rem)] mb-[calc(50%-1.4rem)] text-center pointer-events-none">
        <p className="font-display text-2xl font-bold leading-none text-ink-900">{pct}%</p>
        <p className="text-[10px] font-bold text-ink-500 mt-0.5">
          {value}/{total}
        </p>
      </div>
      <p className="text-[11px] font-bold text-ink-700 text-center leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-ink-500 text-center">{sub}</p>}
    </div>
  );
}

/** 横長のメーター（リングを置くほどでもない比率） */
export function Meter({
  value,
  total,
  label,
  hint,
}: {
  value: number;
  total: number;
  label: string;
  hint?: string;
}) {
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const pct = Math.round(ratio * 100);
  const color = ratio >= 0.8 ? STATUS.good : ratio >= 0.5 ? STATUS.warning : STATUS.critical;

  return (
    <div title={`${label}：${value} / ${total}（${pct}%）`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold text-ink-700">{label}</span>
        <span className="ml-auto text-[11px] font-bold text-ink-700">
          {value}/{total}
        </span>
        <span className="text-[11px] font-bold text-ink-500 w-9 text-right">{pct}%</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full" style={{ background: GRID }}>
        <div
          className="chart-bar-h h-full rounded-full"
          style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%`, background: color }}
        />
      </div>
      {hint && <p className="text-[10px] text-ink-500 mt-1">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 見出し

/** ダッシュボードのセクション見出し */
export function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="section-title !mb-0">{title}</h2>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
