import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { getBrand } from "@/lib/brand";
import { defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { BigMenuLink, IconMenuLink } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { ShiftNoticeBanner } from "@/components/shift-banner";
import { Dashboard } from "@/components/dashboard";
import { AnnouncementBoard } from "@/components/announcement-board";
import { ThemePicker } from "@/components/theme-picker";
import { getSalonBoardUrl } from "@/lib/settings";

/** ホームのメニュー1項目。スマホ＝アイコングリッド／PC＝大きなボタンの両方で使う */
interface HomeMenuItem {
  href: string;
  icon: IconName;
  title: string;
  /** スマホのアイコングリッド用の短い呼び名 */
  short: string;
  description: string;
  badge?: string | number | null;
}

// スタッフのホーム：スマホは「今の状況」を上に、メニューはアイコン＋小さな文字の3列グリッドで見せる。
// ログイン後に選んだ業態（EREYS/ENi）に応じてメニュー（項目）を切り替える。
export default async function StaffHomePage() {
  const session = await requireSession();
  const brand = await getBrand();
  if (!brand) redirect("/select");

  const db = getDataStore();
  const today = todayJst();

  const me = await db.getStaff(session.staffId);
  const jobType = me?.jobType ?? "";
  const isExec = session.role === "admin" || (me?.isExecutive ?? false);

  // 希望休：3ヶ月後の月の申請期間中（毎月5日まで）で、まだ1日も登録がなければ知らせる
  const dayoffTarget = defaultDayoffTargetMonth(today);
  const dayoffEditable = isDayoffEditable(dayoffTarget, today);
  const [myDayoffs, taskSummary, chatOverview, salonBoardUrl] = await Promise.all([
    dayoffEditable
      ? db.listDayoffRequests({ staffId: session.staffId, ...monthRange(dayoffTarget) })
      : Promise.resolve([]),
    getMyTaskSummary(db, session.staffId, today),
    getChatOverview(db, session.staffId),
    getSalonBoardUrl(db),
  ]);
  const shiftBadge = dayoffEditable && myDayoffs.length === 0 ? "！" : null;
  const taskBadge = taskSummary.dueCount > 0 ? taskSummary.dueCount : null;
  const chatBadge = chatOverview.totalUnread > 0 ? chatOverview.totalUnread : null;

  const items =
    brand === "eyes"
      ? await eyesMenuItems(session.staffId, today, { shiftBadge, taskBadge, chatBadge, isExec })
      : await eniMenuItems(session.staffId, today, {
          jobType,
          isExec,
          shiftBadge,
          taskBadge,
          chatBadge,
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

      <ShiftNoticeBanner staffId={session.staffId} />

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
            jobType,
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
          className="chip !py-2.5 !px-4 border-brand-400 text-brand-800"
        >
          <Icon name="link" className="w-4 h-4 text-brand-500" />
          サロンボードを開く
        </a>
        <Link href="/staff/help" className="chip !py-2.5 !px-4">
          <Icon name="help" className="w-4 h-4 text-brand-500" />
          使い方ガイド（困ったときはこちら）
        </Link>
        {session.role === "admin" && (
          <Link href="/admin" className="chip !py-2.5 !px-4">
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
    {
      href: "/staff/counseling",
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
      icon: "user",
      title: "お客様のカルテ",
      short: "カルテ",
      description: "過去のお客様の初期カウンセリングを見返す",
    },
    {
      href: "/staff/report",
      icon: "pencil",
      title: "日報を入力",
      short: "日報",
      description: todayReport ? "本日分は入力済み（修正できます）" : "本日分はまだ未入力です",
      badge: todayReport ? null : "！",
    },
    {
      href: "/staff/tasks",
      icon: "listTodo",
      title: "タスク",
      short: "タスク",
      description: "ルーティン・依頼・会社のタスクを追う",
      badge: flags.taskBadge,
    },
    {
      href: "/staff/chat",
      icon: "chat",
      title: "トークルーム",
      short: "トーク",
      description: "スタッフ同士の連絡（DM・グループ・全体共有）",
      badge: flags.chatBadge,
    },
    {
      href: "/staff/thanks",
      icon: "heart",
      title: "サンクスカード",
      short: "サンクス",
      description: "ありがとうをカードで贈り合う",
    },
    {
      href: "/staff/cash",
      icon: "banknote",
      title: "レジ締め・現金管理",
      short: "レジ締め",
      description: `本日 ${todayCash.length} / ${stores.length}店舗 入力済み`,
    },
    {
      href: "/staff/schedule",
      icon: "calendar",
      title: "出勤スケジュール",
      short: "シフト",
      description: "自分の予定の確認・希望休の提出",
      badge: flags.shiftBadge,
    },
    ...(attendanceAvailable
      ? [
          {
            href: "/staff/attendance",
            icon: "mapPin" as IconName,
            title: "出勤・退勤の打刻",
            short: "打刻",
            description: "お店に着いたら／帰るときに",
          },
        ]
      : []),
    {
      href: "/staff/stats",
      icon: "trendingUp",
      title: "自分の成績",
      short: "成績",
      description: "売上・次回予約率・月次推移",
    },
    {
      href: "/staff/reports",
      icon: "book",
      title: "過去の日報をふりかえる",
      short: "過去日報",
      description: "これまでの日報・ふりかえりを見返す",
    },
    ...(flags.isExec
      ? [
          {
            href: "/staff/exec",
            icon: "crown" as IconName,
            title: "幹部メニュー",
            short: "幹部",
            description: "幹部タスク・店長/副店長のルーティン・日報の気づき",
          },
        ]
      : []),
  ];
}

/** ENi（ヘアサロン）のメニュー項目 */
async function eniMenuItems(
  staffId: string,
  today: string,
  flags: {
    jobType: "" | "stylist" | "assistant";
    isExec: boolean;
    shiftBadge: string | null;
    taskBadge: number | null;
    chatBadge: number | null;
  }
): Promise<HomeMenuItem[]> {
  const db = getDataStore();
  const weekStart = weekStartOf(today);
  const showStylist = flags.jobType !== "assistant"; // スタイリスト or 未設定
  const showWeekly = flags.jobType !== "stylist"; // アシスタント or 未設定

  const [todayPlan, missingMinutes, todayStylistReport, thisWeekReport] = await Promise.all([
    db.listDailyPlans(today).then((plans) => plans.find((p) => p.staffId === staffId) ?? null),
    db.listMeetingsMissingMinutes(today),
    showStylist ? db.getEniReport("stylist", staffId, today) : Promise.resolve(null),
    showWeekly ? db.getEniReport("weekly", staffId, weekStart) : Promise.resolve(null),
  ]);
  const myMissingMinutes = missingMinutes.filter(
    (m) => m.hostStaffId === staffId || m.createdBy === staffId
  ).length;

  return [
    ...(showStylist
      ? [
          {
            href: "/staff/eni-report",
            icon: "pencil" as IconName,
            title: "日報を入力（スタイリスト）",
            short: "日報",
            description: todayStylistReport
              ? "本日分は入力済み（修正できます）"
              : "本日分はまだ未入力です",
            badge: todayStylistReport ? null : "！",
          },
        ]
      : []),
    ...(showWeekly
      ? [
          {
            href: "/staff/weekly-report",
            icon: "pencil" as IconName,
            title: "週報を入力（アシスタント）",
            short: "週報",
            description: thisWeekReport
              ? "今週分は入力済み（修正できます）"
              : "今週分はまだ未入力です",
            badge: thisWeekReport ? null : "！",
          },
        ]
      : []),
    {
      href: "/staff/tasks",
      icon: "listTodo",
      title: "タスク",
      short: "タスク",
      description: "ルーティン・依頼・会社のタスクを追う",
      badge: flags.taskBadge,
    },
    {
      href: "/staff/plan",
      icon: "calendar",
      title: "スケジュール",
      short: "予定",
      description: todayPlan
        ? "入力済み（計画と見比べられます）"
        : "今日の予定をまだ入力していません",
      badge: todayPlan ? null : "！",
    },
    {
      href: "/staff/chat",
      icon: "chat",
      title: "トークルーム",
      short: "トーク",
      description: "スタッフ同士の連絡（DM・グループ・全体共有）",
      badge: flags.chatBadge,
    },
    {
      href: "/staff/thanks",
      icon: "heart",
      title: "サンクスカード",
      short: "サンクス",
      description: "ありがとうをカードで贈り合う",
    },
    {
      href: "/staff/meetings",
      icon: "users",
      title: "ミーティング・1on1",
      short: "議事録",
      description:
        myMissingMinutes > 0
          ? `議事録が未提出のミーティングが ${myMissingMinutes} 件あります`
          : "カレンダーで確認・議事録の提出",
      badge: myMissingMinutes || null,
    },
    {
      href: "/staff/schedule",
      icon: "calendar",
      title: "出勤スケジュール",
      short: "シフト",
      description: "自分の予定の確認・希望休の提出",
      badge: flags.shiftBadge,
    },
    {
      href: "/staff/orders",
      icon: "banknote",
      title: "発注・購入申請",
      short: "発注",
      description: "ウィッグ・社販・商材の申請",
    },
    // 組織図・幹部メニュー・欠勤の報告は管理者・幹部のみ
    ...(flags.isExec
      ? [
          {
            href: "/staff/absence",
            icon: "alertTriangle" as IconName,
            title: "欠勤・早退の報告",
            short: "欠勤報告",
            description: "報告の送信・全員分の確認（幹部）",
          },
          {
            href: "/staff/exec",
            icon: "crown" as IconName,
            title: "幹部メニュー",
            short: "幹部",
            description: "幹部タスク・店長/副店長のルーティン・日報の気づき",
          },
          {
            href: "/staff/org",
            icon: "sparkles" as IconName,
            title: "組織図（シナジーマップ）",
            short: "組織図",
            description: "チームの役割・メンバー・会議体のつながりを見る",
          },
          {
            href: "/staff/practice",
            icon: "sparkles" as IconName,
            title: "練習ペアの設定（幹部）",
            short: "練習ペア",
            description: "今月のペア（誰に付いてもらうか）の割当",
          },
        ]
      : []),
  ];
}
