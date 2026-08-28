// サイドバー付きレイアウトの土台（サーバー側）。
// 役割・業態・職種からメニューを組み立て、「未対応の件数」バッジもここでまとめて取る。
// 画面ごとの表示は children に入るだけなので、各ページ側の変更は不要。

import { getDataStore, isDemoMode } from "@/lib/data";
import { getBrand, BRAND_INFO, type Brand } from "@/lib/brand";
import { getBrandName, getLogoSrc } from "@/lib/logo";
import { buildMobileTabs, buildNav, type NavContext } from "@/lib/nav";
import { addDays, jstDayBoundsUtc, monthRange, thisMonthJst, todayJst, weekStartOf } from "@/lib/date";
import { defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary, hasExecNotice } from "@/lib/tasks";
import { buildRoutineStatuses, countUndone, currentPeriodKeys } from "@/lib/eni/routines";
import { AppShell } from "@/components/app-shell";
import { DemoBanner } from "@/components/ui";
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

  // 希望休の未提出（申請期間中のみ）
  const dayoffTarget = defaultDayoffTargetMonth(today);
  const dayoffEditable = isDayoffEditable(dayoffTarget, today);

  const badges: NavContext["badges"] = {};
  let attendanceEnabled = false;

  if (brand === "eyes") {
    const [pending, stores, myReport, myDayoffs] = await Promise.all([
      db.listCounselingResponses({ status: "pending" }),
      db.listStores(),
      isAdmin ? Promise.resolve(null) : db.getDailyReport(session.staffId, today),
      dayoffEditable && !isAdmin
        ? db.listDayoffRequests({ staffId: session.staffId, ...monthRange(dayoffTarget) })
        : Promise.resolve([]),
    ]);
    attendanceEnabled = stores.some((s) => s.attendanceEnabled);
    badges.counseling = pending.length;
    if (!isAdmin) {
      badges.report = myReport ? 0 : 1;
      badges.shift = dayoffEditable && myDayoffs.length === 0 ? 1 : 0;
    }
    if (isAdmin) {
      const appointments = await db.listNextAppointments({ from: new Date() });
      badges.appointments = appointments.filter(
        (a) => a.status === "change_requested" || a.status === "cancelled"
      ).length;
    }
  } else {
    const weekStart = weekStartOf(today);
    const [missingMinutes, myPlan, myStylist, myWeekly, myDayoffs] = await Promise.all([
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
      dayoffEditable && !isAdmin
        ? db.listDayoffRequests({ staffId: session.staffId, ...monthRange(dayoffTarget) })
        : Promise.resolve([]),
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
      badges.shift = dayoffEditable && myDayoffs.length === 0 ? 1 : 0;
    }
  }

  // タスク（今日やること）とトークルーム（未読）のバッジは業態共通
  const [taskSummary, chatOverview] = await Promise.all([
    getMyTaskSummary(db, session.staffId, today),
    getChatOverview(db, session.staffId),
  ]);
  badges.tasks = taskSummary.dueCount;
  badges.chat = chatOverview.totalUnread;

  // 幹部バッジ：未確認の「日報の気づき」＋期限切れの幹部タスク
  if (isExecutive) {
    const noticeReports = (
      await db.listEniReports("stylist", { from: addDays(today, -30), to: today })
    ).filter((r) => hasExecNotice(r.answers));
    const checks = await db.listExecNoticeChecks(noticeReports.map((r) => r.id));
    const checkedIds = new Set(checks.map((c) => c.reportId));
    const uncheckedNotices = noticeReports.filter((r) => !checkedIds.has(r.id)).length;
    const overdueExecTasks = (await db.listStaffTasks({ kind: "exec" })).filter(
      (t) => !t.repeat && t.dueDate && t.dueDate < today
    ).length;
    // 店長・副店長のルーティンの未完了も幹部バッジに足す（毎日の抜けに気づけるように）
    const [routines, routineChecks] = await Promise.all([
      db.listManagerRoutines(),
      db.listManagerRoutineChecks(currentPeriodKeys(today)),
    ]);
    const undoneRoutines = countUndone(buildRoutineStatuses(routines, routineChecks, today));
    badges.exec = uncheckedNotices + overdueExecTasks + undoneRoutines;
  }

  const navContext: NavContext = {
    role: session.role === "admin" ? "admin" : "staff",
    brand,
    jobType,
    isExecutive,
    attendanceEnabled,
    badges,
  };
  const groups = buildNav(navContext);
  const tabs = buildMobileTabs(navContext);

  return (
    <AppShell
      groups={groups}
      tabs={tabs}
      user={{
        name: session.name,
        roleLabel: isAdmin ? "全体管理者" : "スタッフ",
        brandLabel: BRAND_INFO[brand].label,
        brandSub: BRAND_INFO[brand].sub,
        brandMark: brand === "eni" ? "N" : "E",
      }}
      logoSrc={getLogoSrc(brand)}
      logoAlt={getBrandName(brand)}
      homeHref={isAdmin ? "/admin" : "/staff"}
      helpHref={isAdmin ? "/admin/help" : "/staff/help"}
      banner={<DemoBanner show={isDemoMode()} />}
    >
      {children}
    </AppShell>
  );
}
