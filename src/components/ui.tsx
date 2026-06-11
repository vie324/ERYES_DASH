// 画面共通の小さな部品集（EREYSブランド配色）

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/** デモモード時の注意バナー */
export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-ink-900 text-brand-200 text-[11px] font-bold text-center px-3 py-1.5 tracking-wide">
      デモモードで動作中（Supabase未設定のため、データは再起動でリセットされます）
    </div>
  );
}

/** ページ見出し＋戻るリンク */
export function PageHeader({
  title,
  backHref,
  backLabel = "メニューへ戻る",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-4">
      {backHref && (
        <Link
          href={backHref}
          className="inline-block text-sm font-bold text-brand-600 py-1 mb-1 transition-colors hover:text-brand-800"
        >
          ← {backLabel}
        </Link>
      )}
      <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
      <div className="mt-2 h-px w-12 bg-gradient-to-r from-brand-400 to-transparent" />
    </div>
  );
}

/** ホーム画面用の大きなメニューボタン */
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
    <Link href={href} className="card flex items-center gap-4 min-h-[5.5rem]">
      <span className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 text-brand-600">
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold">{title}</span>
        {description && <span className="block text-xs text-ink-500 mt-0.5">{description}</span>}
      </span>
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className="bg-brand-600 text-white text-sm font-bold rounded-full min-w-7 h-7 px-2 flex items-center justify-center shrink-0 shadow-sm">
          {badge}
        </span>
      )}
      <span className="text-brand-300 text-xl shrink-0">›</span>
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
      ? "text-brand-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-ink-900";
  return (
    <div className="card">
      <div className="text-xs font-bold text-ink-500">{label}</div>
      <div className={`font-display text-[1.6rem] leading-tight font-bold mt-1 ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
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
    pending: "bg-brand-100 text-brand-800 border border-brand-300",
    ok: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border border-amber-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    muted: "bg-ink-50 text-ink-500 border border-stone-200",
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
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
    <div className="flex items-center justify-between card !py-2 mb-4">
      <Link
        href={prevHref}
        className="px-4 py-2 font-bold text-brand-500 text-lg transition-colors hover:text-brand-700"
        aria-label="前月"
      >
        ←
      </Link>
      <span className="font-display font-bold text-lg" data-month={month}>
        {monthLabel}
      </span>
      <Link
        href={nextHref}
        className="px-4 py-2 font-bold text-brand-500 text-lg transition-colors hover:text-brand-700"
        aria-label="翌月"
      >
        →
      </Link>
    </div>
  );
}

/** 空状態の表示 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card text-center text-sm text-ink-500 py-10">
      <Icon name="brandMark" className="w-8 h-8 mx-auto mb-3 text-brand-300" />
      {message}
    </div>
  );
}
