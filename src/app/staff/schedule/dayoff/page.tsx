import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { dayoffDeadline, defaultDayoffTargetMonth, isDayoffEditable } from "@/lib/schedule";
import { MonthNav, PageHeader } from "@/components/ui";
import { DayoffCalendar } from "./dayoff-calendar";

// 希望休の申請（スタッフ用）：カレンダーをタップして休みたい日を選び、保存する。
// 対象は「3ヶ月後の月」で、締切は当月7日（例：10月分は7月7日まで）。
export default async function DayoffRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const defaultTarget = defaultDayoffTargetMonth(today);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : defaultTarget;
  const { from, to } = monthRange(month);

  const editable = isDayoffEditable(month, today);
  const deadline = dayoffDeadline(month);
  const isPastMonth = month < thisMonthJst();

  const myDayoffs = await getDataStore().listDayoffRequests({
    staffId: session.staffId,
    from,
    to,
  });

  return (
    <div>
      <PageHeader title="希望休の申請" backHref="/staff/schedule" backLabel="スケジュールへ戻る" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {formatMonthJa(month)}の希望休を保存しました
        </p>
      )}
      {params.error === "deadline" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          締切を過ぎているため保存できませんでした
        </p>
      )}
      {params.error === "input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/schedule/dayoff?month=${addMonths(month, -1)}`}
        nextHref={`/staff/schedule/dayoff?month=${addMonths(month, 1)}`}
      />

      {!isPastMonth && (
        <p
          className={`rounded-xl text-sm font-bold px-4 py-3 mb-4 ${
            editable ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-500"
          }`}
        >
          {editable
            ? `この月の締切：${formatDateJa(deadline, true)} まで`
            : `締切（${formatDateJa(deadline, true)}）を過ぎたため変更できません。調整はお店にご相談ください。`}
        </p>
      )}

      <DayoffCalendar
        month={month}
        initialSelected={myDayoffs.map((r) => r.date)}
        editable={editable && !isPastMonth}
      />

      <div className="card mt-4 text-xs text-ink-500 space-y-1">
        <p className="font-bold text-ink-600">希望休のルール</p>
        <p>・毎月1週目（7日）までに、3ヶ月後の月の希望休を申請します（次回予約を2ヶ月先まで受けるため）。</p>
        <p>・定休日・お休みの曜日は申請不要です（基本パターンで自動的にお休みになります）。</p>
        <p>・締切後の変更は、お店に直接ご相談ください（管理者が個別調整できます）。</p>
      </div>
    </div>
  );
}
