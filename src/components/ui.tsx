// 画面共通の小さな部品集

import Link from "next/link";

/** デモモード時の注意バナー */
export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-amber-100 text-amber-800 text-xs font-bold text-center px-3 py-1.5">
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
        <Link href={backHref} className="inline-block text-sm font-bold text-rose-600 py-1 mb-1">
          ← {backLabel}
        </Link>
      )}
      <h1 className="text-xl font-bold">{title}</h1>
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
  icon: string;
  badge?: string | number | null;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-4 active:bg-rose-50 transition-colors min-h-[5.5rem]"
    >
      <span className="text-3xl w-12 h-12 flex items-center justify-center bg-rose-50 rounded-xl shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold">{title}</span>
        {description && <span className="block text-xs text-stone-500 mt-0.5">{description}</span>}
      </span>
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className="bg-rose-500 text-white text-sm font-bold rounded-full min-w-7 h-7 px-2 flex items-center justify-center shrink-0">
          {badge}
        </span>
      )}
      <span className="text-stone-300 text-xl shrink-0">›</span>
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
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-stone-800";
  return (
    <div className="card">
      <div className="text-xs font-bold text-stone-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
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
    pending: "bg-rose-100 text-rose-700",
    ok: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-700",
    muted: "bg-stone-100 text-stone-500",
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
      <Link href={prevHref} className="px-4 py-2 font-bold text-rose-600 text-lg" aria-label="前月">
        ←
      </Link>
      <span className="font-bold" data-month={month}>
        {monthLabel}
      </span>
      <Link href={nextHref} className="px-4 py-2 font-bold text-rose-600 text-lg" aria-label="翌月">
        →
      </Link>
    </div>
  );
}

/** 空状態の表示 */
export function EmptyState({ message }: { message: string }) {
  return <div className="card text-center text-sm text-stone-500 py-8">{message}</div>;
}
