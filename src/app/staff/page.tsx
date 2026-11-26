import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, todayJst } from "@/lib/date";
import { getBrand } from "@/lib/brand";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { BigMenuLink, IconMenuLink } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import type { MenuAccent } from "@/lib/menu-accent";
import { DayoffNoticeBanner } from "@/components/shift-banner";
import { getDayoffNotice } from "@/lib/shift/requests";
import { Dashboard } from "@/components/dashboard";
import { AnnouncementBoard } from "@/components/announcement-board";
import { ThemePicker } from "@/components/theme-picker";
import { getSalonBoardUrl } from "@/lib/settings";
import { EniHome } from "@/components/home/eni-home";
import { InboxBanner } from "@/components/inbox-banner";
import { countUncommentedReports, isReportReviewer } from "@/lib/eyes/report-comments";

/** ホームのメニュー1項目。スマホ＝アイコングリッド／PC＝大きなボタンの両方で使う */
interface HomeMenuItem {
  href: string;
  icon: IconName;
  title: string;
  /** スマホのアイコングリッド用の短い呼び名 */
  short: string;
  description: string;
  badge?: string | number | null;
  /** その項目の色。近い意味の項目は同じ色にして、探すときの目印にする */
  accent: MenuAccent;
}

// スタッフのホーム。ログイン後に選んだ業態（EREYS/ENi）で切り替える。
//  ・ENi …… 作り直したホーム（components/home/eni-home.tsx。管理者も同じ画面）
//  ・EREYS …… 今のまま：スマホは「今の状況」を上に、メニューはアイコン＋小さな文字の3列グリッド
export default async function StaffHomePage() {
  const session = await requireSession();
  const brand = await getBrand();
  if (!brand) redirect("/select");
  if (brand === "eni") return <EniHome session={session} />;

  const db = getDataStore();
  const today = todayJst();

  const me = await db.getStaff(session.staffId);
  const isExec = session.role === "admin" || (me?.isExecutive ?? false);

  // 希望休：募集のお知らせの期間（締切の前の月の15日〜締切日）に、まだ出していなければ知らせる
  const [dayoffNotice, taskSummary, chatOverview, salonBoardUrl] = await Promise.all([
    session.role === "admin" ? Promise.resolve(null) : getDayoffNotice(db, session.staffId, today),
    getMyTaskSummary(db, session.staffId, today),
    getChatOverview(db, session.staffId),
    getSalonBoardUrl(db),
  ]);
  const shiftBadge = dayoffNotice ? "！" : null;
  const taskBadge = taskSummary.dueCount > 0 ? taskSummary.dueCount : null;
  const chatBadge = chatOverview.totalUnread > 0 ? chatOverview.totalUnread : null;

  // 店舗の管理者（担当店舗のある人）は「日報へのコメント」を先頭に出す。本人には未読のコメントを「過去日報」に出す
  const reviewer = me && session.role === "manager" && isReportReviewer(me) ? me : null;
  const [uncommented, notifications] = await Promise.all([
    reviewer ? countUncommentedReports(db, reviewer, today) : Promise.resolve(0),
    db.listAppNotifications(session.staffId, 50),
  ]);
  const unreadReportComments = notifications.filter((n) => n.readAt === null && n.kind.startsWith("report")).length;
  const items = await eyesMenuItems(session.staffId, today, {
    shiftBadge,
    taskBadge,
    chatBadge,
    isExec,
    reviewer: Boolean(reviewer),
    uncommented,
    unreadReportComments,
  });

  return (
    <div>
      {/* あいさつ（今日の日付とお名前） */}
      <div className="mb-5">
        <p className="text-xs font-bold tracking-[0.14em] text-brand-600 mb-1.5">
          {formatDateJa(today, true)}
        </p>
        <h1 className="font-display text-2xl sm:text-[1.8rem] leading-tight font-bold text-ink-900">
          {session.name}さん、おつかれさまです
        </h1>
        <div className="mt-3 h-px bg-gradient-to-r from-brand-300 via-brand-200/70 to-transparent" />
      </div>

      {/* 全体共有のアナウンス（トークルームでアナウンスにした投稿がここに出る） */}
      <AnnouncementBoard />

      {/* 日報へのコメントなど、未読のお知らせ */}
      <InboxBanner staffId={session.staffId} />

      {/* 店舗の管理者：まだコメントのない日報（直近3日） */}
      {uncommented > 0 && (
        <Link
          href="/staff/daily-reports?filter=todo"
          className="flex items-center gap-3 rounded-2xl border border-brand-300 bg-gradient-to-r from-brand-100 to-brand-50 p-4 mb-4"
        >
          <span className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0 bg-white text-brand-600">
            <Icon name="chat" className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-brand-800">まだコメントのない日報が {uncommented}件 あります</span>
            <span className="block text-xs text-ink-500 mt-0.5">担当店舗のスタッフの直近3日の日報・タップしてコメント ›</span>
          </span>
        </Link>
      )}

      <DayoffNoticeBanner notice={dayoffNotice} />

      {/* スマホもPCも「今の状況」を上に、メニューはその下に */}
      <section>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="section-title flex-1">今の状況</h2>
        </div>
        <ThemePicker current={me?.themeColor ?? ""} back="/staff" />
        <Dashboard
          brand={brand}
          viewer={{
            staffId: session.staffId,
            jobType: me?.jobType ?? "",
            isExec,
            themeColor: me?.themeColor ?? "",
          }}
        />
      </section>

      <section className="mt-2">
        <h2 className="section-title">メニュー</h2>

        {/* スマホ：アイコン＋小さな文字の3列グリッド */}
        <div className="grid grid-cols-3 gap-2 sm:hidden">
          {items.map((item) => (
            <IconMenuLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.short}
              badge={item.badge}
              accent={item.accent}
            />
          ))}
        </div>

        {/* タブレット・PC：説明つきの大きなボタン */}
        <div className="hidden sm:grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <BigMenuLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              title={item.title}
              description={item.description}
              badge={item.badge}
              accent={item.accent}
            />
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {/* 予約管理はサロンボードで行うので、ここからすぐ開けるようにする */}
        <a
          href={salonBoardUrl}
          target="_blank"
          rel="noreferrer"
          className="home-action home-action-primary"
        >
          <Icon name="link" className="w-4 h-4 text-brand-500" />
          サロンボードを開く
        </a>
        <Link href="/staff/help" className="home-action">
          <Icon name="help" className="w-4 h-4 text-brand-500" />
          使い方ガイド（困ったときはこちら）
        </Link>
        {session.role === "admin" && (
          <Link href="/admin" className="home-action">
            <Icon name="sliders" className="w-4 h-4 text-brand-500" />
            管理者画面へ
          </Link>
        )}
      </div>
    </div>
  );
}

/** アイサロン（EREYS）のメニュー項目 */
async function eyesMenuItems(
  staffId: string,
  today: string,
  flags: {
    shiftBadge: string | null;
    taskBadge: number | null;
    chatBadge: number | null;
    isExec: boolean;
    /** 店舗の管理者（担当店舗のスタッフの日報にコメントする人） */
    reviewer: boolean;
    /** まだコメントのない日報（直近） */
    uncommented: number;
    /** 自分の日報についた、まだ読んでいないコメント・返信 */
    unreadReportComments: number;
  }
): Promise<HomeMenuItem[]> {
  const db = getDataStore();
  const [pendingCounseling, todayReport, stores, todayCash] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.getDailyReport(staffId, today),
    db.listStores(),
    db.listCashReports({ from: today, to: today }),
  ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  return [
    ...(flags.reviewer
      ? [
          {
            href: "/staff/daily-reports",
            accent: "plum" as MenuAccent,
            icon: "chat" as IconName,
            title: "日報へのコメント（担当店舗）",
            short: "日報コメ",
            description:
              flags.uncommented > 0
                ? `まだコメントのない日報が ${flags.uncommented} 件あります`
                : "担当店舗のスタッフの日報を見て、コメントを送る",
            badge: flags.uncommented || null,
          },
        ]
      : []),
    {
      href: "/staff/counseling",
      accent: "sky",
      icon: "clipboard",
      title: "本日のカウンセリング",
      short: "カウンセ",
      description:
        pendingCounseling.length > 0
          ? `未確認が ${pendingCounseling.length} 件あります`
          : "未確認はありません",
      badge: pendingCounseling.length || null,
    },
    {
      href: "/staff/customers",
      accent: "teal",
      icon: "user",
      title: "お客様のカルテ",
      short: "カルテ",
      description: "過去のお客様の初期カウンセリングを見返す",
    },
    {
      href: "/staff/report",
      accent: "coral",
      icon: "pencil",
      title: "日報を入力",
      short: "日報",
      description: todayReport ? "本日分は入力済み（修正できます）" : "本日分はまだ未入力です",
      badge: todayReport ? null : "！",
    },
    {
      href: "/staff/tasks",
      accent: "indigo",
      icon: "listTodo",
      title: "タスク",
      short: "タスク",
      description: "ルーティン・依頼・会社のタスクを追う",
      badge: flags.taskBadge,
    },
    {
      href: "/staff/chat",
      accent: "lavender",
      icon: "chat",
      title: "トークルーム",
      short: "トーク",
      description: "スタッフ同士の連絡（DM・グループ・全体共有）",
      badge: flags.chatBadge,
    },
    {
      href: "/staff/sns",
      accent: "plum",
      icon: "heart",
      title: "社内SNS（いい事例・サンクス）",
      short: "SNS",
      description: "いい事例の共有と、ありがとうを贈り合う",
    },
    {
      href: "/staff/cash",
      accent: "clay",
      icon: "banknote",
      title: "レジ締め・現金管理",
      short: "レジ締め",
      description: `本日 ${todayCash.length} / ${stores.length}店舗 入力済み`,
    },
    {
      href: "/staff/schedule",
      accent: "sage",
      icon: "calendar",
      title: "シフト・希望休",
      short: "シフト",
      description: "自分のシフトの確認・希望休の提出",
      badge: flags.shiftBadge,
    },
    ...(attendanceAvailable
      ? [
          {
            href: "/staff/attendance",
            accent: "rose" as MenuAccent,
            icon: "mapPin" as IconName,
            title: "出勤・退勤の打刻",
            short: "打刻",
            description: "お店に着いたら／帰るときに",
          },
        ]
      : []),
    {
      href: "/staff/stats",
      accent: "gold",
      icon: "trendingUp",
      title: "自分の成績",
      short: "成績",
      description: "売上・次回予約率・月次推移",
    },
    {
      href: "/staff/reports",
      accent: "coral",
      icon: "book",
      title: "過去の日報をふりかえる",
      short: "過去日報",
      description:
        flags.unreadReportComments > 0
          ? `日報に新しいコメントが ${flags.unreadReportComments} 件あります`
          : "これまでの日報・ふりかえり・届いたコメントを見返す",
      badge: flags.unreadReportComments || null,
    },
    ...(flags.isExec
      ? [
          {
            href: "/staff/exec",
            accent: "plum" as MenuAccent,
            icon: "crown" as IconName,
            title: "幹部メニュー",
            short: "幹部",
            description: "幹部タスク・店長/副店長のルーティン・日報の気づき",
          },
        ]
      : []),
  ];
}
