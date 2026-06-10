import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, todayJst } from "@/lib/date";
import { BigMenuLink } from "@/components/ui";

// スタッフのホーム：迷わないよう「やること」を大きなボタン4つだけにする
export default async function StaffHomePage() {
  const session = await requireSession();
  const db = getDataStore();
  const today = todayJst();

  const [pendingCounseling, todayReport, store] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.getDailyReport(session.staffId, today),
    db.getStore(),
  ]);

  return (
    <div>
      <p className="text-sm text-stone-500 font-bold mb-1">{formatDateJa(today, true)}</p>
      <h1 className="text-xl font-bold mb-5">
        {session.name}さん、おつかれさまです
      </h1>

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
        {store.attendanceEnabled && (
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
