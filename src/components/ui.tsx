// 画面共通の小さな部品集（ENi／EREYSブランド配色）

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/** デモモード時の注意バナー */
export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-sidebar-900 text-brand-200 text-[11px] font-bold text-center px-3 py-1.5 tracking-wide print:hidden">
      デモモードで動作中
      {/* スマホでは1行に収まる短い文言にする */}
      <span className="sm:hidden">（データは再起動でリセット）</span>
      <span className="hidden sm:inline">
        （Supabase未設定のため、データは再起動でリセットされます）
      </span>
    </div>
  );
}

/** ページ見出し（戻るリンク・説明文・右側のボタンを置ける） */
export function PageHeader({
  title,
  backHref,
  backLabel = "メニューへ戻る",
  description,
  icon,
  actions,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  description?: string;
  icon?: IconName;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs font-bold text-ink-400 py-1 mb-1 transition-colors hover:text-brand-700"
        >
          <span aria-hidden="true">←</span>
          {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-11 h-11 shrink-0 hidden sm:flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200/70 border border-brand-200 text-brand-700">
              <Icon name={icon} className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-[1.75rem] leading-tight font-bold text-ink-900">
              {title}
            </h1>
            {description && <p className="text-sm text-ink-500 mt-1">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="mt-3 h-px bg-gradient-to-r from-brand-300 via-brand-200/70 to-transparent" />
    </div>
  );
}

/** カードで囲ったセクション（見出し＋右上のリンク） */
export function SectionCard({
  title,
  action,
  className = "",
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="section-title !mb-0 flex-1 min-w-0">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** ホーム画面用の大きなメニューボタン（グリッドに並べても崩れない） */
export function BigMenuLink({
  href,
  title,
  description,
  icon,
  badge,
}: {
  href: string;
  title: string;
  description?: string;
  icon: IconName;
  badge?: string | number | null;
}) {
  return (
    <Link
      href={href}
      className="card group flex items-center gap-3.5 min-h-[5.25rem] h-full relative overflow-hidden"
    >
      {/* ホバー時に左端をゴールドで光らせる */}
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand-400 to-brand-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span className="w-12 h-12 flex items-center justify-center rounded-2xl shrink-0 bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 text-brand-700 transition-colors duration-300 group-hover:from-brand-100 group-hover:to-brand-200 group-hover:border-brand-300">
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold text-ink-900 leading-snug text-balance">
          {title}
        </span>
        {description && (
          <span className="block text-xs text-ink-500 mt-1 leading-relaxed text-pretty">
            {description}
          </span>
        )}
      </span>
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className="bg-gradient-to-b from-brand-500 to-brand-600 text-white text-sm font-bold rounded-full min-w-7 h-7 px-2 flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(148,129,90,0.35)]">
          {badge}
        </span>
      )}
      <Icon
        name="chevronRight"
        className="w-4 h-4 shrink-0 text-brand-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-brand-500"
      />
    </Link>
  );
}

/** KPI表示カード */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "warning" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "text-brand-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-ink-900";
  const accentBar =
    tone === "accent"
      ? "from-brand-400 to-brand-600"
      : tone === "warning"
        ? "from-amber-300 to-amber-500"
        : tone === "danger"
          ? "from-red-300 to-red-500"
          : "from-ink-200 to-ink-300";
  return (
    <div className="card relative overflow-hidden !p-3.5">
      <span className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accentBar}`} />
      <div className="text-[11px] font-bold text-ink-500 leading-tight">{label}</div>
      <div className={`font-display text-[1.6rem] leading-tight font-bold mt-1.5 ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-400 mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

/** 状態バッジ */
export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "pending" | "ok" | "warning" | "danger" | "muted";
}) {
  const cls = {
    pending: "bg-brand-100 text-brand-800 border-brand-300",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    muted: "bg-ink-50 text-ink-500 border-ink-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          {
            pending: "bg-brand-500",
            ok: "bg-emerald-500",
            warning: "bg-amber-500",
            danger: "bg-red-500",
            muted: "bg-ink-300",
          }[tone]
        }`}
      />
      {label}
    </span>
  );
}

/** 月切り替え（前月・翌月リンク） */
export function MonthNav({
  month,
  monthLabel,
  prevHref,
  nextHref,
}: {
  month: string;
  monthLabel: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div className="flex items-center justify-between card !py-1.5 !px-2 mb-4">
      <Link
        href={prevHref}
        className="w-11 h-11 flex items-center justify-center rounded-xl text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
        aria-label="前月"
      >
        <Icon name="chevronRight" className="w-5 h-5 rotate-180" />
      </Link>
      <span className="font-display font-bold text-lg text-ink-900" data-month={month}>
        {monthLabel}
      </span>
      <Link
        href={nextHref}
        className="w-11 h-11 flex items-center justify-center rounded-xl text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
        aria-label="翌月"
      >
        <Icon name="chevronRight" className="w-5 h-5" />
      </Link>
    </div>
  );
}

/** 横に長い表の下に置く案内（スマホのみ表示） */
export function ScrollHint({
  text = "横にスクロールすると全員分が見られます",
}: {
  text?: string;
}) {
  return (
    <p className="scroll-hint">
      <Icon name="chevronRight" className="w-3 h-3" />
      {text}
    </p>
  );
}

/** 画面の読み込み中に出す骨組み（切り替えたときに真っ白にしない） */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="skeleton h-7 w-52" />
      <div className="skeleton h-px w-full mt-4 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-52 mt-3" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mt-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-[5.25rem]" />
        ))}
      </div>
    </div>
  );
}

/** 空状態の表示 */
export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white/60 text-center text-sm text-ink-500 py-10 px-4">
      <span className="mx-auto mb-3 flex w-12 h-12 items-center justify-center rounded-full bg-brand-50 border border-brand-100">
        <Icon name="brandMark" className="w-6 h-6 text-brand-300" />
      </span>
      {message}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
