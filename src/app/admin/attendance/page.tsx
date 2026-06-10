import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  aggregateAttendance,
  formatMinutes,
  formatPunchTime,
  overtimeStatus,
} from "@/lib/attendance";
import { addMonths, formatDateJa, formatMonthJa, jstDayBoundsUtc, monthRange, thisMonthJst } from "@/lib/date";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";

// 勤怠管理（管理者用）：月次の労働時間と固定残業の超過アラート
export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; staff?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);

  const db = getDataStore();
  const [store, staffList, punches] = await Promise.all([
    db.getStore(),
    db.listStaff(),
    db.listAttendances({
      from: jstDayBoundsUtc(from).start,
      to: jstDayBoundsUtc(to).end,
    }),
  ]);

  const activeStaff = staffList.filter((s) => s.isActive);
  const summaries = activeStaff.map((s) => {
    const own = punches.filter((p) => p.staffId === s.id);
    const agg = aggregateAttendance(own);
    return {
      staff: s,
      agg,
      status: overtimeStatus(agg.overtimeMinutes, s.fixedOvertimeHours),
      invalidCount: own.filter((p) => !p.isValid).length,
    };
  });

  const selectedStaffId =
    params.staff && activeStaff.some((s) => s.id === params.staff)
      ? params.staff
      : (activeStaff[0]?.id ?? "");
  const selected = summaries.find((s) => s.staff.id === selectedStaffId);

  return (
    <div>
      <PageHeader title="勤怠管理" backHref="/admin" />

      {!store.attendanceEnabled && (
        <p className="rounded-xl bg-amber-50 text-amber-800 text-xs font-bold px-4 py-3 mb-4">
          勤怠運用は現在オフです（マスタ設定で変更できます）。過去の記録は閲覧できます。
        </p>
      )}

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/admin/attendance?month=${addMonths(month, -1)}`}
        nextHref={`/admin/attendance?month=${addMonths(month, 1)}`}
      />

      <section className="card mb-4">
        <h2 className="font-bold text-sm text-stone-500 mb-2">月次集計（{formatMonthJa(month)}）</h2>
        <p className="text-xs text-stone-400 mb-2">
          残業＝1日8時間を超えた分の合計（仮ルール）。固定残業時間の80%で「注意」、超過で「超過」表示。
        </p>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>スタッフ</th>
                <th className="!text-right">出勤日数</th>
                <th className="!text-right">労働時間</th>
                <th className="!text-right">残業</th>
                <th>固定残業</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ staff, agg, status, invalidCount }) => (
                <tr key={staff.id}>
                  <td className="font-bold">
                    <Link href={`/admin/attendance?month=${month}&staff=${staff.id}`} className="underline">
                      {staff.name}
                    </Link>
                  </td>
                  <td className="text-right">{agg.workDays}日</td>
                  <td className="text-right font-bold">{formatMinutes(agg.totalMinutes)}</td>
                  <td className="text-right">{formatMinutes(agg.overtimeMinutes)}</td>
                  <td>{staff.fixedOvertimeHours}時間</td>
                  <td>
                    {status === "over" ? (
                      <StatusBadge label="超過" tone="danger" />
                    ) : status === "warning" ? (
                      <StatusBadge label="注意" tone="warning" />
                    ) : (
                      <StatusBadge label="OK" tone="ok" />
                    )}
                    {invalidCount > 0 && (
                      <span className="text-xs text-stone-400 ml-1">不成立{invalidCount}件</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="card">
          <h2 className="font-bold text-sm text-stone-500 mb-2">
            日別の打刻（{selected.staff.name}）
          </h2>
          {selected.agg.days.length === 0 ? (
            <EmptyState message="この月の打刻はありません" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>出勤</th>
                    <th>退勤</th>
                    <th className="!text-right">労働時間</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.agg.days.map((d) => (
                    <tr key={d.date}>
                      <td className="font-bold">{formatDateJa(d.date)}</td>
                      <td>{formatPunchTime(d.inAt)}</td>
                      <td>{formatPunchTime(d.outAt)}</td>
                      <td className="text-right font-bold">{formatMinutes(d.workMinutes)}</td>
                      <td>
                        {d.hasOpenPunch && <StatusBadge label="退勤打刻なし" tone="warning" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-stone-400 mt-2">
            ※ 勤怠は任意運用のため、打刻が無い日があっても問題ありません。
          </p>
        </section>
      )}
    </div>
  );
}
