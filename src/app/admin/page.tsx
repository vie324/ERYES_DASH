import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addDays,
  formatDateJa,
  jstDayBoundsUtc,
  monthRange,
  thisMonthJst,
  todayJst,
} from "@/lib/date";
import { formatPercent, formatYen, summarize } from "@/lib/kpi";
import { aggregateAttendance, formatMinutes, overtimeStatus } from "@/lib/attendance";
import { getMonthlyPushCount, LINE_FREE_QUOTA } from "@/lib/push-count";
import { currentTargetMonth } from "@/lib/shift/period";
import { BigMenuLink, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";

// 管理者ダッシュボード：本日・当月の数字と注意事項を一目で確認し、各機能へ移動する
export default async function AdminHomePage() {
  await requireAdmin();
  const db = getDataStore();
  const today = todayJst();
  const month = thisMonthJst();
  const { from, to } = monthRange(month);

  const tomorrowBounds = jstDayBoundsUtc(addDays(today, 1));
  const [todayReports, monthReports, pending, stores, staffList, pushCount, tomorrowAppointments] =
    await Promise.all([
      db.listDailyReports({ from: today, to: today }),
      db.listDailyReports({ from, to }),
      db.listCounselingResponses({ status: "pending" }),
      db.listStores(),
      db.listStaff(),
      getMonthlyPushCount(db),
      db.listNextAppointments({ from: tomorrowBounds.start, to: tomorrowBounds.end }),
    ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  const todayKpi = summarize(todayReports);
  const monthKpi = summarize(monthReports);

  // シフト：募集中の月の提出状況
  const shiftRules = await db.getShiftRules();
  const shiftTargetMonth = currentTargetMonth(shiftRules);
  const shiftSubmissions = await db.listShiftRequestMonths(shiftTargetMonth);
  const activeStaffCount = staffList.filter((s) => s.isActive).length;
  const shiftUnsubmitted = Math.max(0, activeStaffCount - shiftSubmissions.length);

  // 残業アラート（勤怠運用がONのときのみ）
  const overtimeAlerts: { name: string; minutes: number; status: "warning" | "over" }[] = [];
  if (attendanceAvailable) {
    const monthStart = jstDayBoundsUtc(from).start;
    const monthEnd = jstDayBoundsUtc(to).end;
    const punches = await db.listAttendances({ from: monthStart, to: monthEnd });
    for (const s of staffList.filter((s) => s.isActive)) {
      const agg = aggregateAttendance(punches.filter((p) => p.staffId === s.id));
      const status = overtimeStatus(agg.overtimeMinutes, s.fixedOvertimeHours);
      if (status !== "ok") {
        overtimeAlerts.push({ name: s.name, minutes: agg.overtimeMinutes, status });
      }
    }
  }

  return (
    <div>
      <p className="text-sm text-stone-500 font-bold mb-1">{formatDateJa(today, true)}</p>
      <h1 className="font-display text-2xl font-bold mb-4">管理者メニュー</h1>

      {(overtimeAlerts.length > 0 || pushCount >= LINE_FREE_QUOTA * 0.8) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4 space-y-1.5">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
            <Icon name="alertTriangle" className="w-4 h-4" />
            お知らせ・アラート
          </p>
          {overtimeAlerts.map((a) => (
            <p key={a.name} className={`text-sm font-bold flex items-start gap-2 ${a.status === "over" ? "text-red-600" : "text-amber-700"}`}>
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.status === "over" ? "bg-red-500" : "bg-amber-400"}`} />
              <span>
                {a.name}：残業 {formatMinutes(a.minutes)}（固定残業を
                {a.status === "over" ? "超過しています" : "超過しそうです"}）
                <Link href="/admin/attendance" className="underline ml-1">詳細</Link>
              </span>
            </p>
          ))}
          {pushCount >= LINE_FREE_QUOTA * 0.8 && (
            <p className="text-sm font-bold text-amber-700 flex items-start gap-2">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-amber-400" />
              <span>当月のLINE送信数が {pushCount}通 です（無料枠 {LINE_FREE_QUOTA}通）</span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="本日の売上（全員）" value={formatYen(todayKpi.totalSales)} tone="accent"
          sub={`施術 ${todayKpi.totalClients}人（日報 ${todayReports.length}件）`} />
        <StatCard label="今月の売上（全員）" value={formatYen(monthKpi.totalSales)}
          sub={`次回予約率 ${formatPercent(monthKpi.rebookRate)}`} />
        <StatCard label="明日のリマインド予定" value={`${tomorrowAppointments.length}件`}
          sub="毎日19時に自動送信" />
        <StatCard
          label="今月のLINE送信数"
          value={`${pushCount} / ${LINE_FREE_QUOTA}通`}
          tone={pushCount >= LINE_FREE_QUOTA ? "danger" : pushCount >= LINE_FREE_QUOTA * 0.8 ? "warning" : "default"}
          sub="無料枠は月500通"
        />
      </div>

      <div className="space-y-3">
        <BigMenuLink href="/admin/reports" icon="barChart" title="成績・日報"
          description="全スタッフの売上・予約率・月次推移" />
        <BigMenuLink href="/admin/shift" icon="calendar" title="シフト管理"
          description={`希望の集計・自動割当・確定（未提出 ${shiftUnsubmitted}名）`}
          badge={shiftUnsubmitted} />
        <BigMenuLink href="/admin/counseling" icon="clipboard" title="カウンセリング"
          description="回答の閲覧・確認状況" badge={pending.length} />
        <BigMenuLink href="/admin/customers" icon="user" title="顧客一覧"
          description="LINE登録済みのお客様" />
        <BigMenuLink href="/admin/appointments" icon="bell" title="次回予約・リマインド"
          description="予約登録と前日リマインドの状況" />
        <BigMenuLink href="/admin/broadcast" icon="megaphone" title="一斉配信"
          description="全顧客へのお知らせ送信" />
        <BigMenuLink href="/admin/csv" icon="fileText" title="売上CSV出力"
          description="税理士提出用（期間指定）" />
        {attendanceAvailable && (
          <BigMenuLink href="/admin/attendance" icon="clock" title="勤怠管理"
            description="労働時間・残業の月次集計" />
        )}
        <BigMenuLink href="/admin/settings" icon="sliders" title="マスタ設定"
          description="店舗・スタッフ・勤怠運用の設定" />
      </div>

      <p className="mt-6 text-center">
        <Link href="/staff" className="text-sm font-bold text-brand-700 underline">
          スタッフ画面へ（日報入力・打刻はこちら）
        </Link>
      </p>
    </div>
  );
}
