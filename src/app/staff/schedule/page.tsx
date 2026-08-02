import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  datesOfMonth,
  formatDateJa,
  formatMonthJa,
  monthRange,
  thisMonthJst,
  todayJst,
  weekdayJa,
  weekdayOf,
} from "@/lib/date";
import {
  dayoffDeadline,
  defaultDayoffTargetMonth,
  formatWorkTime,
  resolveScheduleDay,
} from "@/lib/schedule";
import { MonthNav, PageHeader } from "@/components/ui";

// 出勤スケジュール（スタッフ用）：みんなの1ヶ月の予定を一覧で確認する。
// 基本パターン（曜日ごと）から自動で組まれ、希望休・管理者の個別調整が反映される。
export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();

  const db = getDataStore();
  const [staffList, patterns, dayoffs, overrides] = await Promise.all([
    db.listStaff(),
    db.listWorkPatterns(),
    db.listDayoffRequests({ from, to }),
    db.listScheduleOverrides({ from, to }),
  ]);
  const activeStaff = staffList.filter((s) => s.isActive);

  const dates = datesOfMonth(month);
  const dayoffTarget = defaultDayoffTargetMonth(today);

  return (
    <div>
      <PageHeader title="出勤スケジュール" backHref="/staff" />

      {/* 希望休の申請への導線（締切の案内つき） */}
      <Link
        href="/staff/schedule/dayoff"
        className="card flex items-center justify-between gap-3 mb-4 border-brand-200 !bg-brand-50/60"
      >
        <span>
          <span className="block font-bold">希望休を申請する</span>
          <span className="block text-xs text-ink-500 mt-0.5">
            {formatMonthJa(dayoffTarget)}分の締切：{formatDateJa(dayoffDeadline(dayoffTarget))}
          </span>
        </span>
        <span className="text-brand-300 text-xl shrink-0">›</span>
      </Link>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/schedule?month=${addMonths(month, -1)}`}
        nextHref={`/staff/schedule?month=${addMonths(month, 1)}`}
      />

      <section className="card">
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>日付</th>
                {activeStaff.map((s) => (
                  <th key={s.id} className={s.id === session.staffId ? "!text-brand-700" : ""}>
                    {s.name}
                    {s.id === session.staffId && "（自分）"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const wd = weekdayOf(date);
                const isToday = date === today;
                return (
                  <tr key={date} className={isToday ? "bg-brand-50/70" : ""}>
                    <td
                      className={`font-bold whitespace-nowrap ${
                        wd === 0 ? "text-red-500" : wd === 6 ? "text-blue-500" : ""
                      }`}
                    >
                      {date.slice(8)}日({weekdayJa(wd)})
                    </td>
                    {activeStaff.map((s) => {
                      const day = resolveScheduleDay(s.id, date, wd, patterns, dayoffs, overrides);
                      return (
                        <td
                          key={s.id}
                          className={`whitespace-nowrap text-xs ${
                            !day.working
                              ? "text-ink-300"
                              : s.id === session.staffId
                                ? "font-bold text-brand-700"
                                : ""
                          }`}
                        >
                          {formatWorkTime(day)}
                          {day.source === "dayoff" && day.working === false && (
                            <span className="text-[10px] text-ink-400 ml-0.5">希</span>
                          )}
                          {day.note && day.source === "override" && (
                            <span className="block text-[10px] text-ink-400">{day.note}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-400 mt-2">
          「休 希」＝希望休 ／ 基本パターン（曜日ごとの勤務）は管理者が設定します
        </p>
      </section>

      <p className="mt-4 text-center">
        <Link href="/staff/shift" className="text-xs font-bold text-ink-400 underline">
          旧シフト機能（早番・遅番）はこちら
        </Link>
      </p>
    </div>
  );
}
