import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, todayJst } from "@/lib/date";
import { currentTargetMonth, isRequestEditable } from "@/lib/shift/period";
import { BigMenuLink } from "@/components/ui";
import { ShiftNoticeBanner } from "@/components/shift-banner";

// スタッフのホーム：迷わないよう「やること」を大きなボタンだけにする
export default async function StaffHomePage() {
  const session = await requireSession();
  const db = getDataStore();
  const today = todayJst();

  const [pendingCounseling, todayReport, stores, shiftRules] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.getDailyReport(session.staffId, today),
    db.listStores(),
    db.getShiftRules(),
  ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  // シフト希望が未提出ならバッジを出す
  const targetMonth = currentTargetMonth(shiftRules);
  const shiftSubmitted = await db.getShiftRequestMonth(session.staffId, targetMonth);
  const shiftBadge =
    !shiftSubmitted && isRequestEditable(targetMonth, shiftRules) ? "！" : null;

  return (
    <div>
      <p className="text-sm text-stone-500 font-bold mb-1">{formatDateJa(today, true)}</p>
      <h1 className="text-xl font-bold mb-5">
        {session.name}さん、おつかれさまです
      </h1>

      <ShiftNoticeBanner staffId={session.staffId} />

      <div className="space-y-3">
        <BigMenuLink
          href="/staff/counseling"
          icon="📋"
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
          icon="✏️"
          title="日報を入力"
          description={todayReport ? "本日分は入力済み（修正できます）" : "本日分はまだ未入力です"}
          badge={todayReport ? null : "！"}
        />
        <BigMenuLink
          href="/staff/shift"
          icon="📅"
          title="シフト"
          description="自分のシフト確認・希望の提出"
          badge={shiftBadge}
        />
        {attendanceAvailable && (
          <BigMenuLink
            href="/staff/attendance"
            icon="📍"
            title="出勤・退勤の打刻"
            description="お店に着いたら／帰るときに"
          />
        )}
        <BigMenuLink
          href="/staff/stats"
          icon="📈"
          title="自分の成績"
          description="売上・次回予約率・月次推移"
        />
      </div>

      {session.role === "admin" && (
        <p className="mt-6 text-center">
          <Link href="/admin" className="text-sm font-bold text-rose-600 underline">
            管理者画面へ
          </Link>
        </p>
      )}
    </div>
  );
}
