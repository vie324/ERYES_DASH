import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { getBrand } from "@/lib/brand";
import { defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
import { BigMenuLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ShiftNoticeBanner } from "@/components/shift-banner";

// スタッフのホーム：迷わないよう「やること」を大きなボタンだけにする。
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

      {brand === "eyes" ? (
        <EyeMenu staffId={session.staffId} today={today} shiftBadge={shiftBadge} />
      ) : (
        <EniMenu
          staffId={session.staffId}
          today={today}
          jobType={jobType}
          isExec={isExec}
          shiftBadge={shiftBadge}
        />
      )}

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

/** アイサロン（EREYS）のメニュー */
async function EyeMenu({
  staffId,
  today,
  shiftBadge,
}: {
  staffId: string;
  today: string;
  shiftBadge: string | null;
}) {
  const db = getDataStore();
  const [pendingCounseling, todayReport, stores, todayCash] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.getDailyReport(staffId, today),
    db.listStores(),
    db.listCashReports({ from: today, to: today }),
  ]);
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);

  return (
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
        href="/staff/customers"
        icon="user"
        title="お客様のカルテ"
        description="過去のお客様の初期カウンセリングを見返す"
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
  );
}

/** ENi（ヘアサロン）のメニュー */
async function EniMenu({
  staffId,
  today,
  jobType,
  isExec,
  shiftBadge,
}: {
  staffId: string;
  today: string;
  jobType: "" | "stylist" | "assistant";
  isExec: boolean;
  shiftBadge: string | null;
}) {
  const db = getDataStore();
  const weekStart = weekStartOf(today);
  const showStylist = jobType !== "assistant"; // スタイリスト or 未設定
  const showWeekly = jobType !== "stylist"; // アシスタント or 未設定

  const [todayPlan, missingMinutes, todayStylistReport, thisWeekReport] = await Promise.all([
    db.listDailyPlans(today).then((plans) => plans.find((p) => p.staffId === staffId) ?? null),
    db.listMeetingsMissingMinutes(today),
    showStylist ? db.getEniReport("stylist", staffId, today) : Promise.resolve(null),
    showWeekly ? db.getEniReport("weekly", staffId, weekStart) : Promise.resolve(null),
  ]);
  const myMissingMinutes = missingMinutes.filter(
    (m) => m.hostStaffId === staffId || m.createdBy === staffId
  ).length;

  return (
    <div className="space-y-3">
      {showStylist && (
        <BigMenuLink
          href="/staff/eni-report"
          icon="pencil"
          title="日報を入力（スタイリスト）"
          description={
            todayStylistReport ? "本日分は入力済み（修正できます）" : "本日分はまだ未入力です"
          }
          badge={todayStylistReport ? null : "！"}
        />
      )}
      {showWeekly && (
        <BigMenuLink
          href="/staff/weekly-report"
          icon="pencil"
          title="週報を入力（アシスタント）"
          description={thisWeekReport ? "今週分は入力済み（修正できます）" : "今週分はまだ未入力です"}
          badge={thisWeekReport ? null : "！"}
        />
      )}
      <BigMenuLink
        href="/staff/morning"
        icon="clock"
        title="今日のスケジュール"
        description={todayPlan ? "入力済み（みんなの予定も見られます）" : "今日の予定をまだ入力していません"}
        badge={todayPlan ? null : "！"}
      />
      <BigMenuLink
        href="/staff/eni-reports"
        icon="fileText"
        title="日報・週報を見る"
        description={jobType === "assistant" ? "みんなの週報を見る" : "みんなの日報・週報を見る"}
      />
      <BigMenuLink
        href="/staff/meetings"
        icon="user"
        title="ミーティング・1on1"
        description={
          myMissingMinutes > 0
            ? `議事録が未提出のミーティングが ${myMissingMinutes} 件あります`
            : "カレンダーで確認・議事録の提出"
        }
        badge={myMissingMinutes}
      />
      <BigMenuLink
        href="/staff/schedule"
        icon="calendar"
        title="出勤スケジュール"
        description="自分の予定の確認・希望休の提出"
        badge={shiftBadge}
      />
      <BigMenuLink
        href="/staff/orders"
        icon="banknote"
        title="発注・購入申請"
        description="ウィッグ・社販・商材の申請"
      />
      <BigMenuLink
        href="/staff/absence"
        icon="alertTriangle"
        title="欠勤・早退の報告"
        description={isExec ? "報告の送信・全員分の確認（幹部）" : "体調不良や早退の報告はこちら"}
      />
      {isExec && (
        <BigMenuLink
          href="/staff/practice"
          icon="sparkles"
          title="練習ペアの設定（幹部）"
          description="今月のペア（誰に付いてもらうか）の割当"
        />
      )}
    </div>
  );
}
