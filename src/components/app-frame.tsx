// サイドバー付きレイアウトの土台（サーバー側）。
// 役割・業態・職種からメニューを組み立て、「未対応の件数」バッジもここでまとめて取る。
// 画面ごとの表示は children に入るだけなので、各ページ側の変更は不要。

import { getDataStore, isDemoMode } from "@/lib/data";
import { getBrand, BRAND_INFO, type Brand } from "@/lib/brand";
import { getBrandName, getLogoSrc } from "@/lib/logo";
import { buildMenuShortcuts, buildMobileTabs, buildNav, homeNavItem, type NavContext } from "@/lib/nav";
import { jstDayBoundsUtc, monthRange, thisMonthJst, todayJst, weekStartOf } from "@/lib/date";
import { getDayoffNotice } from "@/lib/shift/requests";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { countExecAttention } from "@/lib/home/badges";
import { countUncommentedReports, isReportReviewer } from "@/lib/eyes/report-comments";
import { getAppLinks } from "@/lib/settings";
import { AppShell } from "@/components/app-shell";
import { PushSetup } from "@/components/push-setup";
import { DemoBanner } from "@/components/ui";
import { env } from "@/lib/env";
import type { Session } from "@/lib/auth/session";

export async function AppFrame({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const brand: Brand = (await getBrand()) ?? "eni";
  const db = getDataStore();
  const today = todayJst();
  const isAdmin = session.role === "admin";

  const me = await db.getStaff(session.staffId);
  const jobType = me?.jobType ?? "";
  const isExecutive = isAdmin || (me?.isExecutive ?? false);

  // 希望休の未提出（募集のお知らせの期間だけ。ホームのお知らせ・タスクと同じ判定）
  const dayoffNotice = isAdmin ? Promise.resolve(null) : getDayoffNotice(db, session.staffId, today);

  const badges: NavContext["badges"] = {};
  let attendanceEnabled = false;

  if (brand === "eyes") {
    const [pending, stores, myReport, notice] = await Promise.all([
      db.listCounselingResponses({ status: "pending" }),
      db.listStores(),
      isAdmin ? Promise.resolve(null) : db.getDailyReport(session.staffId, today),
      dayoffNotice,
    ]);
    attendanceEnabled = stores.some((s) => s.attendanceEnabled);
    badges.counseling = pending.length;
    if (!isAdmin) {
      badges.report = myReport ? 0 : 1;
      badges.shift = notice ? 1 : 0;
    }
    if (isAdmin) {
      const appointments = await db.listNextAppointments({ from: new Date() });
      badges.appointments = appointments.filter(
        (a) => a.status === "change_requested" || a.status === "cancelled"
      ).length;
    }
  } else {
    const weekStart = weekStartOf(today);
    const [missingMinutes, myPlan, myStylist, myWeekly, notice] = await Promise.all([
      db.listMeetingsMissingMinutes(today),
      isAdmin
        ? Promise.resolve(null)
        : db.listDailyPlans(today).then((p) => p.find((x) => x.staffId === session.staffId) ?? null),
      !isAdmin && jobType !== "assistant"
        ? db.getEniReport("stylist", session.staffId, today)
        : Promise.resolve(null),
      !isAdmin && jobType !== "stylist"
        ? db.getEniReport("weekly", session.staffId, weekStart)
        : Promise.resolve(null),
      dayoffNotice,
    ]);
    if (isAdmin) {
      badges.minutes = missingMinutes.length;
      const { from, to } = monthRange(thisMonthJst());
      const orders = await db.listOrderRequests({
        from: jstDayBoundsUtc(from).start,
        to: jstDayBoundsUtc(to).end,
      });
      badges.orders = orders.filter((o) => o.status === "requested").length;
    } else {
      badges.minutes = missingMinutes.filter(
        (m) => m.hostStaffId === session.staffId || m.createdBy === session.staffId
      ).length;
      badges.plan = myPlan ? 0 : 1;
      if (jobType !== "assistant") badges.eniReport = myStylist ? 0 : 1;
      if (jobType !== "stylist") badges.weeklyReport = myWeekly ? 0 : 1;
      badges.shift = notice ? 1 : 0;
    }
  }

  // タスク（今日やること）・トークルーム（未読）・お知らせ（未読）のバッジは業態共通。外部リンクはメニューの「外部サービス」用
  const [taskSummary, chatOverview, links, unreadInbox] = await Promise.all([
    getMyTaskSummary(db, session.staffId, today),
    getChatOverview(db, session.staffId),
    getAppLinks(db),
    db.countUnreadAppNotifications(session.staffId),
  ]);
  badges.tasks = taskSummary.dueCount;
  badges.chat = chatOverview.totalUnread;
  badges.inbox = unreadInbox;

  // 日報へのコメント（EREYS）：管理者と、担当店舗のある店舗の管理者に「まだコメントのない日報」の数
  const reviewer = me ? isReportReviewer(me) : false;
  if (brand === "eyes" && reviewer && me) {
    badges.reportReview = await countUncommentedReports(db, me, today);
  }

  // 幹部バッジ：未確認の「日報の気づき」＋期限切れの幹部タスク＋自分の店舗のルーティンの未完了
  // （ホームのショートカットと同じ数え方。lib/home/badges.ts）
  if (isExecutive) {
    badges.exec = await countExecAttention(db, me, brand, today);
  }

  const navContext: NavContext = {
    role: session.role === "admin" ? "admin" : "staff",
    brand,
    jobType,
    isExecutive,
    attendanceEnabled,
    badges,
    links,
    // 管理者はいつも「日報へのコメント」が出るので、ここでは店舗の管理者だけ
    isReportReviewer: reviewer && session.role === "manager",
  };
  return (
    <AppShell
      home={homeNavItem(navContext)}
      shortcuts={buildMenuShortcuts(navContext)}
      groups={buildNav(navContext)}
      tabs={buildMobileTabs(navContext)}
      user={{
        name: session.name,
        roleLabel: isAdmin ? "全体管理者" : session.role === "manager" ? "店舗の管理者" : "スタッフ",
        brandLabel: BRAND_INFO[brand].label,
        brandSub: BRAND_INFO[brand].sub,
        brandMark: brand === "eni" ? "N" : "E",
      }}
      logoSrc={getLogoSrc(brand)}
      logoAlt={getBrandName(brand)}
      helpHref={isAdmin ? "/admin/help" : "/staff/help"}
      inbox={{ href: "/staff/inbox", count: unreadInbox }}
      banner={<DemoBanner show={isDemoMode()} />}
    >
      {/* 通知の案内（未許可のときだけ出る）と、アプリアイコンのバッジ（未読トーク＋今日のタスク） */}
      <PushSetup
        publicKey={env.vapidPublicKey}
        badgeCount={taskSummary.dueCount + chatOverview.totalUnread + unreadInbox}
      />
      {children}
    </AppShell>
  );
}
