// 共通ヘッダー：ロゴ（public/logo.svg を差し替え可能）＋ユーザー名＋ログアウト

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import type { Session } from "@/lib/auth/session";

export function AppHeader({ session, homeHref }: { session: Session; homeHref: string }) {
  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
        <Link href={homeHref} className="flex items-center gap-2 min-w-0">
          {/* ロゴ画像は public/logo.svg を差し替えるだけで反映される */}
          <img src="/logo.svg" alt="ERYES" className="h-8 w-auto" />
          <span className="text-[10px] font-bold text-stone-400 border border-stone-200 rounded px-1 py-0.5 shrink-0">
            {session.role === "admin" ? "管理者" : "スタッフ"}
          </span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-stone-600 truncate max-w-28">{session.name}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs font-bold text-stone-500 border border-stone-300 rounded-lg px-2.5 py-1.5 active:bg-stone-100"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
