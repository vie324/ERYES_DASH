// 追加機能（依頼10〜23）の画面で共通に使う小さな部品。
// 見た目は既存の card / chip / btn-* に合わせる（iPhone純正アプリに近い、余白のあるデザイン）。

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { tableReady, type TableDef } from "@/lib/data/collections";

/** 保存しました／入力を確かめてください、の帯（?ok= / ?error= の文をそのまま出す） */
export function Flash({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (!ok && !error) return null;
  return (
    <div className="space-y-2 mb-4" role="status">
      {ok && <p className="rounded-xl bg-emerald-50 text-emerald-800 text-sm font-bold px-4 py-3 border border-emerald-200">{ok}</p>}
      {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm font-bold px-4 py-3 border border-red-200">{error}</p>}
    </div>
  );
}

/**
 * この機能のテーブルが本番DBにまだ無いとき（schema.sql を流す前）の案内。
 * 画面は止めずに、この帯だけを出す（CLAUDE.md の 6）。
 */
export async function NotReadyNotice({ table, isAdmin }: { table: TableDef<{ id: string }>; isAdmin?: boolean }) {
  if (await tableReady(table)) return null;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 mb-4 text-sm text-amber-900">
      <p className="font-bold">この機能はまだ準備中です</p>
      <p className="mt-1 leading-relaxed">
        データベースの準備（新しいテーブルの追加）がまだのため、保存はできません。
        {isAdmin ? "管理者が supabase/schema.sql の「依頼10〜23」の部分を実行すると使えるようになります。" : "管理者に連絡してください。"}
      </p>
    </div>
  );
}

/** AIが作ったものに付ける印（最後は人が決める） */
export function AiBadge({ label = "AIの提案" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] font-bold text-violet-700">
      <Icon name="sparkles" className="w-3 h-3" />
      {label}
    </span>
  );
}

/** 画面の中の切り替え（タブ）。リンクで切り替えるので、URLを開き直しても同じタブになる */
export function TabLinks({ items }: { items: { href: string; label: string; active: boolean; badge?: number }[] }) {
  return (
    <nav className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-4 -mx-1 px-1" aria-label="切り替え">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={`chip shrink-0 ${t.active ? "chip-active" : ""}`} aria-current={t.active ? "page" : undefined}>
          {t.label}
          {t.badge ? (
            <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] leading-5 ${t.active ? "bg-white text-brand-700" : "bg-red-500 text-white"}`}>
              {t.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** 1行のリンク（iPhoneの「設定」のような一覧の行） */
export function RowLink({
  href,
  icon,
  title,
  sub,
  badge,
}: {
  href: string;
  icon: IconName;
  title: string;
  sub?: string;
  badge?: number | string | null;
}) {
  return (
    <Link href={href} className="card !p-3.5 flex items-center gap-3">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 grid place-items-center">
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-900 truncate">{title}</span>
        {sub && <span className="block text-xs text-ink-500 truncate">{sub}</span>}
      </span>
      {badge ? <span className="ios-count">{badge}</span> : null}
      <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-ink-300" />
    </Link>
  );
}

/** 数字のタイル（今月の◯件 など） */
export function MiniStat({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-brand-700";
  return (
    <div className="card !p-3 text-center">
      <p className="text-[11px] font-bold text-ink-500 leading-tight">{label}</p>
      <p className={`font-display text-xl font-bold mt-0.5 tabular-nums ${color}`}>
        {value}
        {unit && <span className="text-xs ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

/** 説明の小さな注意書き（灰色の枠） */
export function Note({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "info" }) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-ink-200 bg-ink-50/60 text-ink-600";
  return <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${cls}`}>{children}</div>;
}
