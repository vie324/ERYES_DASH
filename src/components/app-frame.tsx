// サイドバー付きレイアウトの土台（サーバー側）。
// 役割・業態・職種からメニューを組み立て、「未対応の件数」バッジもここでまとめて取る。
// 画面ごとの表示は children に入るだけなので、各ページ側の変更は不要。

import { getDataStore, isDemoMode } from "@/lib/data";
import { getBrand, BRAND_INFO, type Brand } from "@/lib/brand";
import { getBrandName, getLogoSrc } from "@/lib/logo";
import { buildNav, type NavContext } from "@/lib/nav";
import { jstDayBoundsUtc, monthRange, thisMonthJst, todayJst, weekStartOf } from "@/lib/date";
import { defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
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

  const groups = buildNav({
    role: session.role === "admin" ? "admin" : "staff",
    brand,
    jobType,
    isExecutive,
    attendanceEnabled,
    badges,
  });

  return (
    <AppShell
      groups={groups}
      user={{
        name: session.name,
        roleLabel: isAdmin ? "全体管理者" : "スタッフ",
        brandLabel: BRAND_INFO[brand].label,
        brandSub: BRAND_INFO[brand].sub,
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
