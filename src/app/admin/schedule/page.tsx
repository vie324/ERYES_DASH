import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
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
import { MonthNav, PageHeader, ScrollHint } from "@/components/ui";

// 出勤スケジュール（管理者用）：基本パターン＋希望休から自動で組まれた表を確認し、
// セルをタップして個別調整（休み⇔出勤・時間変更）できる。
export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string }>;
}) {
  await requireAdmin();
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

  // 希望休の提出状況（対象月の申請分をスタッフ別に集計）
  const targetRange = monthRange(dayoffTarget);
  const targetDayoffs = await db.listDayoffRequests({
    from: targetRange.from,
    to: targetRange.to,
  });
  const dayoffByStaff = new Map<string, number>();
  for (const r of targetDayoffs) {
    dayoffByStaff.set(r.staffId, (dayoffByStaff.get(r.staffId) ?? 0) + 1);
  }

  const savedMsg =
    params.saved === "override"
      ? "個別調整を保存しました"
      : params.saved === "override_cleared"
        ? "個別調整を取り消しました"
        : "";

  return (
    <div>
      <PageHeader title="出勤スケジュール" backHref="/admin" />

      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {savedMsg}
        </p>
      )}

      <Link
        href="/admin/schedule/patterns"
        className="card flex items-center justify-between gap-3 mb-4 border-brand-200 !bg-brand-50/60"
      >
        <span>
          <span className="block font-bold">基本パターンの設定</span>
          <span className="block text-xs text-ink-500 mt-0.5">
            スタッフごとに曜日別の出勤・時間を設定（例：フル出勤／平日のみ10:00-16:30）
          </span>
        </span>
        <span className="text-brand-300 text-xl shrink-0">›</span>
      </Link>

      {/* 希望休の提出状況（いま募集中＝3ヶ月後の月） */}
      <section className="card mb-4">
        <h2 className="section-title !mb-1.5">
          希望休の提出状況（{formatMonthJa(dayoffTarget)}分・締切 {formatDateJa(dayoffDeadline(dayoffTarget))}）
        </h2>
        <p className="text-sm">
          {activeStaff.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " ／ "}
              <span className="font-bold">{s.name}</span>：{dayoffByStaff.get(s.id) ?? 0}日
            </span>
          ))}
        </p>
      </section>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/admin/schedule?month=${addMonths(month, -1)}`}
        nextHref={`/admin/schedule?month=${addMonths(month, 1)}`}
      />

      <section className="card">
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>日付</th>
                {activeStaff.map((s) => (
                  <th key={s.id}>{s.name}</th>
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
                        <td key={s.id} className="!p-0">
                          <Link
                            href={`/admin/schedule/day?staff_id=${s.id}&date=${date}`}
                            className={`block px-3 py-2 text-xs whitespace-nowrap ${
                              day.source === "override"
                                ? "bg-amber-50 font-bold text-amber-800"
                                : !day.working
                                  ? "text-ink-300"
                                  : ""
                            }`}
                          >
                            {formatWorkTime(day)}
                            {day.source === "dayoff" && (
                              <span className="text-[10px] text-brand-500 ml-0.5">希</span>
                            )}
                            {day.note && (
                              <span className="block text-[10px] text-ink-400">{day.note}</span>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ScrollHint text="横にスクロールすると全員分が見られます" />
        <p className="text-xs text-ink-400 mt-2">
          セルをタップすると個別調整（休み⇔出勤・時間変更）ができます ／ 「希」＝希望休、黄色＝個別調整済み
        </p>
      </section>

      <p className="mt-4 text-center">
        <Link href="/admin/shift" className="text-xs font-bold text-ink-400 underline">
          旧シフト機能（早番・遅番の自動割当）はこちら
        </Link>
      </p>
    </div>
  );
}
