// 共通ヘッダー：左上にロゴ（public/logo.svg を差し替え可能）＋使い方＋ユーザー名＋ログアウト

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { getLogoSrc } from "@/lib/logo";
import { Icon } from "@/components/icons";
import type { Session } from "@/lib/auth/session";

export function AppHeader({ session, homeHref }: { session: Session; homeHref: string }) {
  const helpHref = session.role === "admin" ? "/admin/help" : "/staff/help";
  return (
    <header className="sticky top-0 z-10 bg-brand-50/85 backdrop-blur border-b border-brand-200/70">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
        <Link href={homeHref} className="flex items-center gap-2.5 min-w-0">
          {/* 正式ロゴ（public/logo.png）があれば自動で優先表示される（src/lib/logo.ts） */}
          <img src={getLogoSrc()} alt="EREYS" className="h-9 w-auto" />
          <span className="text-[10px] font-bold tracking-widest text-brand-600 border border-brand-300 rounded-full px-2 py-0.5 shrink-0">
            {session.role === "admin" ? "管理者" : "スタッフ"}
          </span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={helpHref}
            aria-label="使い方ガイド"
            className="flex items-center gap-1 text-xs font-bold text-brand-600 border border-brand-300 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white active:bg-brand-100"
          >
            <Icon name="help" className="w-4 h-4" />
            使い方
          </Link>
          <span className="hidden sm:inline text-sm font-bold text-ink-700 truncate max-w-28">
            {session.name}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs font-bold text-ink-500 border border-brand-300 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white active:bg-brand-100"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
