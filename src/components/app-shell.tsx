"use client";

// アプリ全体の骨組み。
//  ・PC/iPad横（lg以上）… 左に固定サイドバー、右に内容。項目はグループごとにまとめて表示する。
//  ・スマホ … 親指の届く下部タブに毎日さわる操作だけを置き、「メニュー」から全項目を引き出す。
//    ホームと外部サービス（サロンボード・ノーションなど）はメニューを開いてすぐの位置に置く。
// メニューの中身は @/lib/nav の定義（役割・業態別）をそのまま並べるだけ。

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";
import { accentStyle } from "@/lib/menu-accent";
import { findCurrent, matchesNav, type NavGroup, type NavItem } from "@/lib/nav";

export type ShellUser = {
  name: string;
  roleLabel: string;
  brandLabel: string;
  brandSub: string;
  /** 業態の頭文字（ENi＝N／EREYS＝E） */
  brandMark: string;
};

export function AppShell({
  home,
  shortcuts,
  groups,
  tabs,
  user,
  logoSrc,
  logoAlt,
  helpHref,
  banner,
  children,
}: {
  /** メニューのいちばん上に置く「ホーム」（ロゴの飛び先も兼ねる） */
  home: NavItem;
  /** ホームの下に並べる外部サービスのタイル（サロンボード・ノーションなど） */
  shortcuts: NavItem[];
  groups: NavGroup[];
  /** スマホの下部タブに置く「毎日さわる操作」。右端の「メニュー」は画面側で足す */
  tabs: NavItem[];
  user: ShellUser;
  logoSrc: string;
  logoAlt: string;
  /** 未指定ならヘッダーの「使い方」ボタンを出さない */
  helpHref?: string;
  /** デモモードの注意バナーなど、内容の上に出す帯 */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const homeHref = home.href;

  // 下部タブの詰め具合。タブ＋メニューの数で決める（多いほど小さくする）
  const density = tabDensity(tabs.length + 1);

  // いま開いているメニュー項目（サイドバーの強調と、上部バーの現在地表示に使う）
  const onHome = matchesNav(pathname, home);
  const current = onHome ? null : findCurrent(pathname, groups);
  // 下部タブにない画面（ホーム・サンクスなど）にいるときは「メニュー」を点けて、どこから来たかを示す
  const inMenu = !tabs.some((t) => matchesNav(pathname, t));
  // トークルームの中はLINEのように画面いっぱいで使う（上部バー・下部タブ・帯は出さず、ルーム側の見出しで戻る）
  const immersive = isImmersivePath(pathname);

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
    // --tabbar-h：下部タブの高さ。フォームの固定ボタン（.form-actions）が重ならないようにする
    <div className="min-h-dvh [--tabbar-h:3.75rem] lg:[--tabbar-h:0px]">
      {/* ---------------- PC・iPad：左に固定 ---------------- */}
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 z-30 print:hidden">
        <SidebarBody
          home={home}
          shortcuts={shortcuts}
          groups={groups}
          user={user}
          logoSrc={logoSrc}
          logoAlt={logoAlt}
          onHome={onHome}
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
              home={home}
              shortcuts={shortcuts}
              groups={groups}
              user={user}
              logoSrc={logoSrc}
              logoAlt={logoAlt}
              onHome={onHome}
              currentHref={current?.item.href ?? null}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64 flex flex-col min-h-dvh">
        {!immersive && banner}
        {/* ---------------- 上部バー ---------------- */}
        {!immersive && (
          <header className="sticky top-0 z-20 bg-brand-50/85 backdrop-blur-md border-b border-brand-200/60 print:hidden">
            <div className="mx-auto max-w-6xl px-3 sm:px-5 h-14 flex items-center gap-2">
              <Link href={homeHref} className="lg:hidden flex items-center min-w-0 py-2 pr-2">
                <img src={logoSrc} alt={logoAlt} className="h-7 w-auto max-w-24 object-contain object-left" />
              </Link>

              {/* いま開いている場所（PCのみ） */}
              {onHome ? (
                <p className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-ink-700 min-w-0">
                  <Icon name="home" className="w-3.5 h-3.5 shrink-0 text-ink-400" />
                  {home.label}
                </p>
              ) : current ? (
                <p className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-ink-400 min-w-0">
                  <span className="truncate">{current.group}</span>
                  <Icon name="chevronRight" className="w-3 h-3 shrink-0" />
                  <span className="text-ink-700 truncate">{current.item.label}</span>
                </p>
              ) : null}

              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <Link
                  href="/select"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-white hover:border-brand-400"
                  aria-label="業態を切り替え"
                >
                  <Icon name="swap" className="w-3.5 h-3.5 text-brand-500" />
                  {user.brandLabel}
                </Link>
                {helpHref && (
                  <Link
                    href={helpHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-white hover:border-brand-400"
                  >
                    <Icon name="help" className="w-3.5 h-3.5 text-brand-500" />
                    <span className="hidden sm:inline">使い方</span>
                  </Link>
                )}
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
        )}

        {/* 下部タブぶんの余白（スマホのみ）。iPhoneのホームバーぶんも確保する。
            全画面の画面は中身が自分で位置を決めるので、余白と表示アニメーション（transform）を付けない */}
        <main
          className={
            immersive
              ? "flex-1 w-full"
              : "flex-1 mx-auto w-full max-w-6xl px-3 sm:px-5 py-5 sm:py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-16 animate-fade-up"
          }
        >
          {children}
        </main>
      </div>

      {/* ---------------- スマホ：下部タブ ---------------- */}
      {/* ホームは置かない（メニューの先頭とロゴから戻れる）。毎日さわる操作だけを並べて、文字を読める大きさに保つ */}
      {!immersive && (
        <nav
          aria-label="よく使う操作"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-brand-200/80 bg-brand-50/95 backdrop-blur-md shadow-[0_-4px_16px_-12px_rgba(65,56,40,0.35)] pb-[env(safe-area-inset-bottom)] print:hidden"
        >
          <ul className="flex items-stretch">
            {tabs.map((t) => (
              <li key={t.href} className="flex-1 min-w-0">
                <TabLink
                  href={t.href}
                  icon={t.icon}
                  label={t.short ?? t.label}
                  badge={t.badge}
                  external={t.external}
                  density={density}
                  active={matchesNav(pathname, t)}
                />
              </li>
            ))}
            <li className="flex-1 min-w-0">
              <TabButton
                onClick={() => setOpen(true)}
                icon="menu"
                label="メニュー"
                ariaLabel="メニューを開く"
                density={density}
                active={open || inMenu}
              />
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

/** 画面いっぱいで使う画面か（トークルームの中。一覧 /staff/chat は通常の画面） */
function isImmersivePath(pathname: string): boolean {
  return /^\/staff\/chat\/[^/]+\/?$/.test(pathname);
}

/** 下部タブの詰め具合。並ぶ数（右端のメニューを含む）で決める */
type TabDensity = "normal" | "dense" | "tight";

const TAB_SIZES: Record<TabDensity, { pad: string; icon: string; text: string; pill: string }> = {
  // 6つまで（ENi：トーク・週報・予定・タスク・AIしもん・メニュー）は、文字を11pxで読めるまま並べられる。
  // 幅320px級の小さい端末だけは10pxにして、「AIしもん」が欠けないようにする
  normal: { pad: "px-0.5", icon: "w-6 h-6", text: "text-[10px] min-[360px]:text-[11px]", pill: "w-12 h-8" },
  dense: { pad: "px-0.5", icon: "w-[22px] h-[22px]", text: "text-[10px]", pill: "w-11 h-7" },
  tight: { pad: "px-px", icon: "w-5 h-5", text: "text-[9px]", pill: "w-10 h-7" },
};

function tabDensity(count: number): TabDensity {
  if (count >= 8) return "tight";
  return count >= 7 ? "dense" : "normal";
}

/** 下部タブ1つぶんの中身（アイコン＋件数バッジ＋名前）。いまいる画面はアイコンの後ろに色を敷いて示す */
function TabInner({
  icon,
  label,
  badge,
  active,
  density,
}: {
  icon: NavItem["icon"];
  label: string;
  badge?: NavItem["badge"];
  active: boolean;
  density: TabDensity;
}) {
  const size = TAB_SIZES[density];
  return (
    <>
      <span
        className={`relative flex items-center justify-center rounded-full transition-colors duration-200 ${size.pill} ${
          active ? "bg-brand-200/80 text-brand-800" : ""
        }`}
      >
        <Icon name={icon} className={size.icon} />
        {badge != null && badge !== 0 && (
          <span className="absolute top-0 right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-brand-50">
            {badge}
          </span>
        )}
      </span>
      <span className={`${size.text} font-bold leading-none truncate max-w-full`}>{label}</span>
    </>
  );
}

function tabClassName(active: boolean, density: TabDensity): string {
  const size = TAB_SIZES[density];
  return `w-full h-full flex flex-col items-center justify-center gap-1 pt-1.5 pb-2 ${size.pad} min-h-[3.75rem] transition-colors ${
    active ? "text-brand-800" : "text-ink-500"
  } active:bg-brand-100`;
}

/**
 * 下部タブの1つ（リンク）。ラベルは2行にせず、はみ出す場合は省略する。
 * 外部リンクは新しいタブで開く（ホーム画面に追加したアプリでも戻れるように）。
 */
function TabLink({
  href,
  icon,
  label,
  badge,
  active,
  external,
  density,
}: {
  href: string;
  icon: NavItem["icon"];
  label: string;
  badge?: NavItem["badge"];
  active: boolean;
  external?: boolean;
  density: TabDensity;
}) {
  const inner = <TabInner icon={icon} label={label} badge={badge} active={active} density={density} />;
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={tabClassName(false, density)}>
      {inner}
    </a>
  ) : (
    <Link href={href} aria-current={active ? "page" : undefined} className={tabClassName(active, density)}>
      {inner}
    </Link>
  );
}

/** 下部タブの1つ（ボタン）。右端の「メニュー」に使う */
function TabButton({
  onClick,
  icon,
  label,
  ariaLabel,
  active,
  density,
}: {
  onClick: () => void;
  icon: NavItem["icon"];
  label: string;
  ariaLabel: string;
  active: boolean;
  density: TabDensity;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={tabClassName(active, density)}>
      <TabInner icon={icon} label={label} active={active} density={density} />
    </button>
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
  home,
  shortcuts,
  groups,
  user,
  logoSrc,
  logoAlt,
  onHome,
  currentHref,
  onClose,
}: {
  home: NavItem;
  shortcuts: NavItem[];
  groups: NavGroup[];
  user: ShellUser;
  logoSrc: string;
  logoAlt: string;
  /** ホームを開いているか */
  onHome: boolean;
  /** 現在地のメニュー項目（1つだけ強調する） */
  currentHref: string | null;
  onClose?: () => void;
}) {
  const homeHref = home.href;
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
        {/* ホーム：下部タブから外したので、メニューを開いていちばん上に置く */}
        <Link
          href={homeHref}
          aria-current={onHome ? "page" : undefined}
          className={`nav-link mt-3 ${onHome ? "nav-link-active" : ""}`}
        >
          <Icon
            name={home.icon}
            className={`w-[18px] h-[18px] shrink-0 ${onHome ? "text-brand-300" : "text-sidebar-muted"}`}
          />
          <span className="flex-1 min-w-0 truncate">{home.label}</span>
        </Link>

        {/* 外部サービス：押すとすぐ開くタイル（サロンボード・ノーションなど） */}
        {shortcuts.length > 0 && (
          <div>
            <p className="nav-group-label">外部サービス</p>
            <ul className={`grid gap-2 ${shortcuts.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {shortcuts.map((item) => (
                <li key={item.href}>
                  <ShortcutTile item={item} current={!item.external && item.href === currentHref} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const current = !item.external && item.href === currentHref;
                const inner = (
                  <>
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
                    {item.external && <span className="text-[10px] text-sidebar-muted shrink-0">↗</span>}
                  </>
                );
                return (
                  <li key={item.href}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer" className="nav-link">
                        {inner}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={`nav-link ${current ? "nav-link-active" : ""}`}
                      >
                        {inner}
                      </Link>
                    )}
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

/**
 * メニューの「外部サービス」のタイル1つ。ホームのメニューと同じ色の決まり（accent）でアイコンを塗る。
 * 外部サイトは新しいタブで開き、右上に ↗ を出す。
 */
function ShortcutTile({ item, current }: { item: NavItem; current: boolean }) {
  const className = `relative flex h-full flex-col items-center gap-1.5 rounded-xl border px-1 pt-2.5 pb-2 transition-colors ${
    current
      ? "border-brand-400/70 bg-white/[0.1]"
      : "border-sidebar-line bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12]"
  }`;
  const inner = (
    <>
      <span className="menu-icon !rounded-[0.8rem] h-9 w-9" style={accentStyle(item.accent)}>
        <Icon name={item.icon} className="w-[18px] h-[18px]" />
      </span>
      <span className="text-[10px] font-bold leading-tight text-sidebar-text text-center">
        {item.short ?? item.label}
      </span>
      {item.external && (
        <span className="absolute top-1 right-1.5 text-[9px] text-sidebar-muted" aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={className} aria-label={`${item.label}（新しいタブで開く）`}>
      {inner}
    </a>
  ) : (
    <Link href={item.href} aria-current={current ? "page" : undefined} className={className}>
      {inner}
    </Link>
  );
}
