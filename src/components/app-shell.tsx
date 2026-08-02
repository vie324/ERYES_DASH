"use client";

// アプリ全体の骨組み。
//  ・PC/iPad（lg以上）… 左に固定サイドバー、右に内容。項目はグループごとにまとめて表示する。
//  ・スマホ … 上部バーの「メニュー」から引き出し（ドロワー）で同じサイドバーを出す。
// メニューの中身は @/lib/nav の定義（役割・業態別）をそのまま並べるだけ。

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";
import { findCurrent, type NavGroup } from "@/lib/nav";

export type ShellUser = {
  name: string;
  roleLabel: string;
  brandLabel: string;
  brandSub: string;
  /** 業態の頭文字（ENi＝N／EREYS＝E） */
  brandMark: string;
};

export function AppShell({
  groups,
  user,
  logoSrc,
  logoAlt,
  homeHref,
  helpHref,
  banner,
  children,
}: {
  groups: NavGroup[];
  user: ShellUser;
  logoSrc: string;
  logoAlt: string;
  homeHref: string;
  helpHref: string;
  /** デモモードの注意バナーなど、内容の上に出す帯 */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // いま開いているメニュー項目（サイドバーの強調と、上部バーの現在地表示に使う）
  const current = findCurrent(pathname, groups);

  // ページを移動したらドロワーは閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ドロワーを開いている間は背面をスクロールさせない
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh">
      {/* ---------------- PC・iPad：左に固定 ---------------- */}
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 z-30 print:hidden">
        <SidebarBody
          groups={groups}
          user={user}
          logoSrc={logoSrc}
          logoAlt={logoAlt}
          homeHref={homeHref}
          currentHref={current?.item.href ?? null}
        />
      </aside>

      {/* ---------------- スマホ：ドロワー ---------------- */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex print:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[17rem] max-w-[85vw] animate-slide-in">
            <SidebarBody
              groups={groups}
              user={user}
              logoSrc={logoSrc}
              logoAlt={logoAlt}
              homeHref={homeHref}
              currentHref={current?.item.href ?? null}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64 flex flex-col min-h-dvh">
        {banner}
        {/* ---------------- 上部バー ---------------- */}
        <header className="sticky top-0 z-20 bg-brand-50/85 backdrop-blur-md border-b border-brand-200/60 print:hidden">
          <div className="mx-auto max-w-6xl px-3 sm:px-5 h-14 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="lg:hidden -ml-1 p-2.5 rounded-xl text-ink-700 transition-colors hover:bg-brand-100 active:bg-brand-200"
              aria-label="メニューを開く"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>

            <Link href={homeHref} className="lg:hidden flex items-center min-w-0">
              <img src={logoSrc} alt={logoAlt} className="h-7 w-auto max-w-24 object-contain object-left" />
            </Link>

            {/* いま開いている場所（PCのみ） */}
            {current && (
              <p className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-ink-400 min-w-0">
                <span className="truncate">{current.group}</span>
                <Icon name="chevronRight" className="w-3 h-3 shrink-0" />
                <span className="text-ink-700 truncate">{current.item.label}</span>
              </p>
            )}

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/select"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-white hover:border-brand-400"
                aria-label="業態を切り替え"
              >
                <Icon name="swap" className="w-3.5 h-3.5 text-brand-500" />
                {user.brandLabel}
              </Link>
              <Link
                href={helpHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-white hover:border-brand-400"
              >
                <Icon name="help" className="w-3.5 h-3.5 text-brand-500" />
                <span className="hidden sm:inline">使い方</span>
              </Link>
              <div className="flex items-center gap-2 pl-1.5 sm:pl-2.5 sm:ml-1 sm:border-l border-brand-200">
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-[13px] font-bold text-ink-800 truncate max-w-32">{user.name}</p>
                  <p className="text-[10px] font-bold text-ink-400">{user.roleLabel}</p>
                </div>
                <Avatar name={user.name} />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-5 py-5 sm:py-6 pb-16 animate-fade-up">
          {children}
        </main>
      </div>
    </div>
  );
}

/** 名前の頭文字を丸で出す（写真がないときのアイコン代わり） */
function Avatar({ name }: { name: string }) {
  return (
    <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-display text-sm font-bold shadow-[0_2px_8px_rgba(148,129,90,0.35)]">
      {name.trim().charAt(0) || "―"}
    </span>
  );
}

/** サイドバーの中身（PC固定・スマホのドロワーで共用） */
function SidebarBody({
  groups,
  user,
  logoSrc,
  logoAlt,
  homeHref,
  currentHref,
  onClose,
}: {
  groups: NavGroup[];
  user: ShellUser;
  logoSrc: string;
  logoAlt: string;
  homeHref: string;
  /** 現在地のメニュー項目（1つだけ強調する） */
  currentHref: string | null;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-sidebar-800 to-sidebar-900 border-r border-sidebar-line/70">
      {/* ロゴ */}
      <div className="flex items-center gap-2 px-4 h-16 shrink-0 border-b border-sidebar-line/60">
        <Link href={homeHref} className="flex items-center min-w-0 flex-1">
          {/* ロゴはゴールド。濃色の背景でそのまま映える */}
          <img src={logoSrc} alt={logoAlt} className="h-10 w-auto max-w-40 object-contain object-left" />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
            aria-label="メニューを閉じる"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 業態（切替） */}
      <Link
        href="/select"
        className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl border border-sidebar-line bg-white/[0.04] px-3 py-2.5 transition-colors hover:bg-white/[0.08]"
      >
        <span className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-display text-sm font-bold">
          {user.brandMark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-white leading-tight">
            {user.brandLabel}
          </span>
          <span className="block text-[10px] text-sidebar-muted truncate">{user.brandSub}</span>
        </span>
        <Icon name="swap" className="w-4 h-4 shrink-0 text-sidebar-muted" />
      </Link>

      {/* メニュー */}
      <nav className="flex-1 overflow-y-auto scroll-slim px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const current = item.href === currentHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={`nav-link ${current ? "nav-link-active" : ""}`}
                    >
                      <Icon
                        name={item.icon}
                        className={`w-[18px] h-[18px] shrink-0 ${current ? "text-brand-300" : "text-sidebar-muted"}`}
                      />
                      <span className="flex-1 min-w-0 truncate">{item.label}</span>
                      {item.badge != null && item.badge !== 0 && (
                        <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-brand-500 text-sidebar-900 text-[11px] font-bold flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ユーザー・ログアウト */}
      <div className="shrink-0 border-t border-sidebar-line/60 p-3">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <span className="w-9 h-9 shrink-0 rounded-full bg-white/10 border border-sidebar-line text-brand-200 flex items-center justify-center font-display text-sm font-bold">
            {user.name.trim().charAt(0) || "―"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-white truncate">{user.name}</span>
            <span className="block text-[10px] text-sidebar-muted">{user.roleLabel}</span>
          </span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-sidebar-muted transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <Icon name="logout" className="w-4 h-4" />
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
