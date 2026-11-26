// ENiのホーム（スタッフ・幹部・管理者で共通）。iPhone純正アプリのような、シンプルで読みやすい画面。
// 上から：アナウンス欄 → 4つのリマインド数字 → ショートカット → 見える化 → 全体スケジュールの直近の予定。
// その日はじめて開いたときは、朝のカード（しもんさんの言葉・今日のタスク）を上に重ねて出す。
// 色・余白・角丸の値は globals.css の --ios-* にまとめてある。
// EREYS（アイサロン）のホームは今のまま（app/staff/page.tsx）。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { formatDateJa, jstDayBoundsUtc, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { getDayoffNotice } from "@/lib/shift/requests";
import { getSalonBoardUrl, settingsMap } from "@/lib/settings";
import { listUpcomingCompanyEvents } from "@/lib/company-events";
import { eniReminderTiles } from "@/lib/home/reminders";
import { shortcutBadges } from "@/lib/home/badges";
import { HOME_SHORTCUTS_KEY, parseShortcutSettings, shortcutsFor } from "@/lib/home/shortcuts";
import { HOME_VISIBILITY_KEY, parseInsightVisibility } from "@/lib/home/visibility";
import { buildHomeInsights } from "@/lib/home/insights";
import { getWordOfDay } from "@/lib/home/words";
import { accentStyle, type MenuAccent } from "@/lib/menu-accent";
import type { Session } from "@/lib/auth/session";
import { AnnouncementBoard } from "@/components/announcement-board";
import { DayoffNoticeBanner } from "@/components/shift-banner";
import { InboxBanner } from "@/components/inbox-banner";
import { Icon, type IconName } from "@/components/icons";
import { InsightCardView, ReminderTiles, ShortcutGrid, UpcomingEvents } from "@/components/home/parts";
import { MorningCard, MorningCardButton } from "@/components/home/morning-card";
import { RequiredInputsCard } from "@/components/required-inputs-card";

/** 直近の全体スケジュールをホームに出す件数 */
const UPCOMING_EVENTS = 3;

export async function EniHome({ session }: { session: Session }) {
  const db = getDataStore();
  const today = todayJst();
  const isAdmin = session.role === "admin";

  const [me, settingRows] = await Promise.all([db.getStaff(session.staffId), db.listAppSettings()]);
  const settings = settingsMap(settingRows);
  const jobType = me?.jobType ?? "";
  const isExec = isAdmin || (me?.isExecutive ?? false);
  const viewer = { isAdmin, isExec, jobType };

  const [dayoffNotice, taskSummary, chatOverview, tiles, insights, events, word, salonBoardUrl] = await Promise.all([
    isAdmin ? Promise.resolve(null) : getDayoffNotice(db, session.staffId, today),
    getMyTaskSummary(db, session.staffId, today),
    getChatOverview(db, session.staffId),
    eniReminderTiles(db, { staffId: session.staffId, jobType }, today),
    buildHomeInsights(
      db,
      { staffId: session.staffId, isExec, storeId: me?.storeId ?? "", jobType },
      parseInsightVisibility(settings[HOME_VISIBILITY_KEY]),
      today
    ),
    listUpcomingCompanyEvents(db, today, { limit: UPCOMING_EVENTS }),
    getWordOfDay(db, today),
    getSalonBoardUrl(db),
  ]);

  const shortcuts = shortcutsFor(parseShortcutSettings(settings[HOME_SHORTCUTS_KEY]), viewer);
  const badges = await shortcutBadges(db, {
    me,
    isAdmin,
    isExec,
    brand: "eni",
    today,
    taskDue: taskSummary.dueCount,
    chatUnread: chatOverview.totalUnread,
  });

  return (
    <div className="ios-home mx-auto max-w-2xl">
      {/* 見出し：日付・名前。右上から朝のカードを開き直せる */}
      <header className="px-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold ios-secondary">{formatDateJa(today)}</p>
          <MorningCardButton />
        </div>
        <h1 className="ios-large-title mt-1 break-words">{session.name}さん</h1>
        <p className="text-[15px] ios-secondary mt-0.5">おつかれさまです</p>
      </header>

      {/* 依頼14：まだの入力（入力するまで消えない。いちばん上） */}
      <RequiredInputsCard staffId={session.staffId} variant="ios" />

      {/* アナウンス欄（全体共有で固定した投稿。タップで元の投稿へ） */}
      <div className="mt-4 empty:hidden">
        <AnnouncementBoard />
      </div>

      {/* 未読のお知らせ（日報へのコメントなど） */}
      <InboxBanner staffId={session.staffId} variant="ios" />

      <DayoffNoticeBanner notice={dayoffNotice} />

      <section className="ios-section !mt-4" aria-labelledby="home-reminders">
        <h2 id="home-reminders" className="ios-section-header">
          今の状況
        </h2>
        <ReminderTiles tiles={tiles} />
      </section>

      {shortcuts.length > 0 && (
        <section className="ios-section" aria-labelledby="home-shortcuts">
          <div className="ios-section-header">
            <h2 id="home-shortcuts">ショートカット</h2>
            {isAdmin && <Link href="/admin/home">並びを変える</Link>}
          </div>
          <ShortcutGrid items={shortcuts} badges={badges} />
        </section>
      )}

      {insights.length > 0 && (
        <section className="ios-section" aria-labelledby="home-insights">
          <div className="ios-section-header">
            <h2 id="home-insights">見える化</h2>
            {isAdmin && <Link href="/admin/home#visibility">見せる範囲</Link>}
          </div>
          <div className="space-y-[var(--ios-gap)]">
            {insights.map((card) => (
              <InsightCardView key={card.key} card={card} />
            ))}
          </div>
        </section>
      )}

      <section className="ios-section" aria-labelledby="home-events">
        <div className="ios-section-header">
          <h2 id="home-events">全体スケジュール</h2>
          <Link href="/staff/plan?tab=all">すべて見る</Link>
        </div>
        <UpcomingEvents events={events} />
      </section>

      {isAdmin && <AdminMenu />}

      <section className="ios-section">
        <div className="ios-list">
          <FooterRow href={salonBoardUrl} external icon="link" accent="sky" label="サロンボードを開く" />
          <FooterRow
            href={isAdmin ? "/admin/help" : "/staff/help"}
            icon="help"
            accent="indigo"
            label="使い方ガイド（困ったときはこちら）"
          />
          <FooterRow href="/staff/notifications" icon="bell" accent="teal" label="通知の設定" />
        </div>
      </section>

      <MorningCard
        staffId={session.staffId}
        today={today}
        dateLabel={formatDateJa(today)}
        word={word?.body ?? null}
      />
    </div>
  );
}

/** 管理者だけのメニュー（以前の管理者ダッシュボードの「対応が必要なもの」とメニュー） */
async function AdminMenu() {
  const db = getDataStore();
  const today = todayJst();
  const { from, to } = monthRange(thisMonthJst());
  const [missingMinutes, orders] = await Promise.all([
    db.listMeetingsMissingMinutes(today),
    db.listOrderRequests({ from: jstDayBoundsUtc(from).start, to: jstDayBoundsUtc(to).end }),
  ]);
  const requestedOrders = orders.filter((o) => o.status === "requested").length;
  const rows: { href: string; icon: IconName; accent: MenuAccent; label: string; sub: string; badge?: number }[] = [
    { href: "/staff/eni-reports", icon: "fileText", accent: "coral", label: "日報・週報を見る", sub: "閲覧・コメント・週報の閲覧状況" },
    {
      href: "/staff/meetings",
      icon: "users",
      accent: "sage",
      label: "ミーティング・議事録",
      sub: missingMinutes.length > 0 ? `議事録の未提出 ${missingMinutes.length}件` : "予定と議事録の提出状況",
      badge: missingMinutes.length,
    },
    { href: "/staff/absence", icon: "alertTriangle", accent: "rose", label: "欠勤・早退の報告一覧", sub: "幹部・管理者のみ" },
    {
      href: "/staff/orders",
      icon: "banknote",
      accent: "clay",
      label: "発注・購入申請の管理",
      sub: requestedOrders > 0 ? `申請中 ${requestedOrders}件` : "ウィッグ・社販・商材",
      badge: requestedOrders,
    },
    { href: "/admin/schedule", icon: "calendar", accent: "lavender", label: "シフト", sub: "希望休の確認・シフト表の作成と公開" },
    { href: "/admin/home", icon: "layoutGrid", accent: "gold", label: "ホームの設定", sub: "ショートカット・見える化・しもんさんの言葉" },
    { href: "/admin/settings", icon: "sliders", accent: "indigo", label: "マスタ設定", sub: "店舗・スタッフ・各種の文言" },
  ];
  return (
    <section className="ios-section" aria-labelledby="home-admin">
      <h2 id="home-admin" className="ios-section-header">
        管理者メニュー
      </h2>
      <div className="ios-list">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="ios-row">
            <span className="ios-row-icon" style={accentStyle(r.accent)}>
              <Icon name={r.icon} className="w-[18px] h-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold truncate">{r.label}</span>
              <span className="block text-[12px] ios-secondary truncate">{r.sub}</span>
            </span>
            {r.badge ? <span className="ios-count">{r.badge}</span> : null}
            <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-[#c7c7cc]" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function FooterRow({
  href,
  icon,
  accent,
  label,
  external,
}: {
  href: string;
  icon: IconName;
  accent: MenuAccent;
  label: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="ios-row-icon" style={accentStyle(accent)}>
        <Icon name={icon} className="w-[18px] h-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold truncate">{label}</span>
      <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-[#c7c7cc]" />
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="ios-row">
      {inner}
    </a>
  ) : (
    <Link href={href} className="ios-row">
      {inner}
    </Link>
  );
}
