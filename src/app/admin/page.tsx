import Link from "next/link";
import { redirect } from "next/navigation";
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
import { getBrand } from "@/lib/brand";
import { BigMenuLink, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Dashboard } from "@/components/dashboard";

// 管理者ダッシュボード：ログイン後に選んだ業態（EREYS/ENi）に応じて内容を切り替える
export default async function AdminHomePage() {
  await requireAdmin();
  const brand = await getBrand();
  if (!brand) redirect("/select");
  const today = todayJst();

  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-bold tracking-[0.14em] text-brand-600 mb-1.5">
          {formatDateJa(today, true)}
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="font-display text-2xl sm:text-[1.8rem] leading-tight font-bold text-ink-900">
            管理者ダッシュボード
          </h1>
          <span className="inline-flex items-center rounded-full border border-brand-300 bg-white px-2.5 py-0.5 font-display text-xs font-bold text-brand-700">
            {brand === "eyes" ? "EREYS" : "ENi"}
          </span>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-brand-300 via-brand-200/70 to-transparent" />
      </div>

      {/* 上部ダッシュボード：グラフで今の進捗をひと目で */}
      <Dashboard brand={brand} />

      {brand === "eyes" ? <EyesAdminDashboard /> : <EniAdminDashboard />}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/admin/help" className="chip !py-2.5 !px-4">
          <Icon name="help" className="w-4 h-4 text-brand-500" />
          使い方ガイド（運用の流れ・各機能の説明）
        </Link>
        <Link href="/staff" className="chip !py-2.5 !px-4">
          <Icon name="pencil" className="w-4 h-4 text-brand-500" />
          スタッフ画面へ（日報入力・打刻はこちら）
        </Link>
      </div>
    </div>
  );
}

/** EREYS（アイサロン）の管理ダッシュボード */
async function EyesAdminDashboard() {
  const db = getDataStore();
  const today = todayJst();
  const month = thisMonthJst();
  const { from, to } = monthRange(month);

  const tomorrowBounds = jstDayBoundsUtc(addDays(today, 1));
  const [todayReports, monthReports, pending, stores, staffList, pushCount, upcomingAppointments] =
    await Promise.all([
      db.listDailyReports({ from: today, to: today }),
      db.listDailyReports({ from, to }),
      db.listCounselingResponses({ status: "pending" }),
      db.listStores(),
      db.listStaff(),
      getMonthlyPushCount(db),
      db.listNextAppointments({ from: new Date() }),
    ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  const todayKpi = summarize(todayReports);
  const monthKpi = summarize(monthReports);

  const tomorrowAppointments = upcomingAppointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.scheduledAt >= tomorrowBounds.start &&
      a.scheduledAt < tomorrowBounds.end
  );
  const appointmentAttention = upcomingAppointments.filter(
    (a) => a.status === "change_requested" || a.status === "cancelled"
  ).length;

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
    <>
      {(overtimeAlerts.length > 0 || pushCount >= LINE_FREE_QUOTA * 0.8) && (
        <div className="note note-warn !p-4 mb-4 space-y-1.5">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
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

      <h2 className="section-title mt-6">今日・今月の数字</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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

      <h2 className="section-title mt-6">メニュー</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <BigMenuLink href="/admin/reports" icon="barChart" title="成績・日報"
          description="全スタッフの売上・予約率・月次推移" />
        <BigMenuLink href="/admin/schedule" icon="calendar" title="出勤スケジュール"
          description="基本パターン＋希望休でシフトを管理" />
        <BigMenuLink href="/admin/counseling" icon="clipboard" title="カウンセリング"
          description="回答の閲覧・確認状況" badge={pending.length} />
        <BigMenuLink href="/admin/customers" icon="user" title="顧客一覧"
          description="LINE登録済みのお客様" />
        <BigMenuLink href="/admin/appointments" icon="bell" title="次回予約・リマインド"
          description={
            appointmentAttention > 0
              ? `お客様からの変更希望・キャンセルが ${appointmentAttention} 件あります`
              : "予約登録・事前案内とリマインドの状況"
          }
          badge={appointmentAttention} />
        <BigMenuLink href="/admin/broadcast" icon="megaphone" title="一斉配信"
          description="全顧客へのお知らせ送信" />
        <BigMenuLink href="/admin/csv" icon="fileText" title="売上CSV出力"
          description="税理士提出用（期間指定）" />
        {attendanceAvailable && (
          <BigMenuLink href="/admin/attendance" icon="clock" title="勤怠管理"
            description="労働時間・残業の月次集計" />
        )}
        <BigMenuLink href="/admin/settings" icon="sliders" title="マスタ設定"
          description="店舗・スタッフ（職種・幹部）・勤怠運用の設定" />
      </div>
    </>
  );
}

/** ENi（ヘアサロン）の管理ダッシュボード */
async function EniAdminDashboard() {
  const db = getDataStore();
  const today = todayJst();
  const month = thisMonthJst();
  const { from, to } = monthRange(month);

  const [missingMinutes, orders] = await Promise.all([
    db.listMeetingsMissingMinutes(today),
    db.listOrderRequests({ from: jstDayBoundsUtc(from).start, to: jstDayBoundsUtc(to).end }),
  ]);
  const requestedOrders = orders.filter((o) => o.status === "requested").length;

  return (
    <>
      <h2 className="section-title mt-6">対応が必要なもの</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="議事録 未提出"
          value={`${missingMinutes.length}件`}
          tone={missingMinutes.length > 0 ? "warning" : "default"}
          sub="実施日を過ぎたミーティング"
        />
        <StatCard
          label="発注 申請中"
          value={`${requestedOrders}件`}
          tone={requestedOrders > 0 ? "accent" : "default"}
          sub="ウィッグ・社販・商材"
        />
      </div>

      <h2 className="section-title mt-6">メニュー</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <BigMenuLink href="/staff/eni-reports" icon="fileText" title="日報・週報を見る"
          description="スタイリスト日報・アシスタント週報の閲覧＋コメント" />
        <BigMenuLink href="/staff/practice" icon="sparkles" title="練習ペアの設定"
          description="今月のペア（誰に付いてもらうか）の割当" />
        <BigMenuLink href="/staff/meetings" icon="user" title="ミーティング・議事録"
          description="カレンダーで予定確認・議事録の提出状況"
          badge={missingMinutes.length} />
        <BigMenuLink href="/staff/absence" icon="alertTriangle" title="欠勤・早退の報告一覧"
          description="誰が・何時間・どんな理由か（幹部・管理者のみ）" />
        <BigMenuLink href="/staff/orders" icon="banknote" title="発注・購入申請の管理"
          description="ウィッグ・社販・商材の申請と発注状況"
          badge={requestedOrders} />
        <BigMenuLink href="/admin/schedule" icon="calendar" title="出勤スケジュール"
          description="基本パターン＋希望休でシフトを管理" />
        <BigMenuLink href="/admin/settings" icon="sliders" title="マスタ設定"
          description="スタッフの職種・幹部・店舗の設定" />
      </div>
    </>
  );
}
