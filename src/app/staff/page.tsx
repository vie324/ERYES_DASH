import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, monthRange, todayJst } from "@/lib/date";
import { defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
import { BigMenuLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ShiftNoticeBanner } from "@/components/shift-banner";

// スタッフのホーム：迷わないよう「やること」を大きなボタンだけにする
export default async function StaffHomePage() {
  const session = await requireSession();
  const db = getDataStore();
  const today = todayJst();

  const [pendingCounseling, todayReport, stores, todayCash] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.getDailyReport(session.staffId, today),
    db.listStores(),
    db.listCashReports({ from: today, to: today }),
  ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  // 希望休：3ヶ月後の月の申請期間中（毎月7日まで）で、まだ1日も登録がなければ知らせる
  const dayoffTarget = defaultDayoffTargetMonth(today);
  const dayoffEditable = isDayoffEditable(dayoffTarget, today);
  const myDayoffs = dayoffEditable
    ? await db.listDayoffRequests({ staffId: session.staffId, ...monthRange(dayoffTarget) })
    : [];
  const shiftBadge = dayoffEditable && myDayoffs.length === 0 ? "！" : null;

  return (
    <div>
      <p className="text-sm text-stone-500 font-bold mb-1">{formatDateJa(today, true)}</p>
      <h1 className="font-display text-2xl font-bold mb-5">
        {session.name}さん、おつかれさまです
      </h1>

      <ShiftNoticeBanner staffId={session.staffId} />

      <div className="space-y-3">
        <BigMenuLink
          href="/staff/counseling"
          icon="clipboard"
          title="本日のカウンセリング"
          description={
            pendingCounseling.length > 0
              ? `未確認が ${pendingCounseling.length} 件あります`
              : "未確認はありません"
          }
          badge={pendingCounseling.length}
        />
        <BigMenuLink
          href="/staff/report"
          icon="pencil"
          title="日報を入力"
          description={todayReport ? "本日分は入力済み（修正できます）" : "本日分はまだ未入力です"}
          badge={todayReport ? null : "！"}
        />
        <BigMenuLink
          href="/staff/cash"
          icon="banknote"
          title="レジ締め・現金管理"
          description={`本日 ${todayCash.length} / ${stores.length}店舗 入力済み`}
        />
        <BigMenuLink
          href="/staff/schedule"
          icon="calendar"
          title="出勤スケジュール"
          description="自分の予定の確認・希望休の提出"
          badge={shiftBadge}
        />
        {attendanceAvailable && (
          <BigMenuLink
            href="/staff/attendance"
            icon="mapPin"
            title="出勤・退勤の打刻"
            description="お店に着いたら／帰るときに"
          />
        )}
        <BigMenuLink
          href="/staff/stats"
          icon="trendingUp"
          title="自分の成績"
          description="売上・次回予約率・月次推移"
        />
        <BigMenuLink
          href="/staff/reports"
          icon="book"
          title="過去の日報をふりかえる"
          description="これまでの日報・ふりかえりを見返す"
        />
      </div>

      <Link
        href="/staff/help"
        className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-brand-700 py-3"
      >
        <Icon name="help" className="w-4 h-4" />
        使い方ガイド（困ったときはこちら）
      </Link>

      {session.role === "admin" && (
        <p className="mt-2 text-center">
          <Link href="/admin" className="text-sm font-bold text-brand-700 underline">
            管理者画面へ
          </Link>
        </p>
      )}
    </div>
  );
}
