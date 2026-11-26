import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatMinutes, overtimeStatus } from "@/lib/attendance";
import { minutesLabel, monthAttendanceRecords, totalsOf } from "@/lib/attendance-shift";
import { addMonths, formatDateJa, formatMonthJa, formatTimeJa, thisMonthJst } from "@/lib/date";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Note } from "@/components/feature-ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// 勤怠管理（管理者用）。依頼12で、その日のシフトとひもづけた記録（遅刻・早退・シフト外・承認された打刻の修正）を読むように切り替えた。
// 月の勤務時間はCSVで書き出せる（給与計算用）。
export default async function AdminAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; staff?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const db = getDataStore();
  const [stores, staffList] = await Promise.all([db.listStores(), db.listStaff()]);
  const activeStaff = staffList.filter((s) => s.isActive);
  const records = await monthAttendanceRecords(db, month, { staffIds: activeStaff.map((s) => s.id) });
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);
  const summaries = activeStaff.map((s) => {
    const days = records.get(s.id) ?? [];
    const t = totalsOf(days);
    // 残業の目安（これまでどおり：1日8時間を超えた分）
    const overtime = days.reduce((sum, d) => sum + Math.max(0, d.netMinutes - 480), 0);
    return { staff: s, days, t, overtime, status: overtimeStatus(overtime, s.fixedOvertimeHours) };
  });
  const selected = summaries.find((s) => s.staff.id === params.staff) ?? summaries[0];

  return (
    <div>
      <PageHeader
        title="勤怠管理"
        backHref="/admin"
        actions={
          <>
            <a href={`/api/admin/attendance-csv?month=${month}&type=summary`} className="btn-ghost !text-xs">
              <Icon name="fileText" className="w-4 h-4" />
              月の集計CSV
            </a>
            <a href={`/api/admin/attendance-csv?month=${month}&type=daily`} className="btn-ghost !text-xs">
              <Icon name="fileText" className="w-4 h-4" />
              日別CSV
            </a>
          </>
        }
      />
      {!attendanceAvailable && <Note tone="warn">打刻は現在オフです（マスタ設定で変更できます）。過去の記録は見られます。</Note>}
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/admin/attendance?month=${addMonths(month, -1)}`} nextHref={`/admin/attendance?month=${addMonths(month, 1)}`} />

      <section className="card mb-4">
        <h2 className="section-title">月の集計（{formatMonthJa(month)}）</h2>
        <p className="text-xs text-ink-400 mb-2">
          実働＝勤務時間から休憩を引いた時間（休憩の決まりは管理画面で変えられます）。遅刻・早退はその日のシフトと比べています。打刻の修正は承認されたものだけ数えます。
        </p>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>スタッフ</th>
                <th className="!text-right">出勤日数</th>
                <th className="!text-right">実働</th>
                <th className="!text-right">遅刻</th>
                <th className="!text-right">早退</th>
                <th className="!text-right">シフト外</th>
                <th className="!text-right">打刻なし</th>
                <th>残業の目安</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ staff, t, overtime, status }) => (
                <tr key={staff.id}>
                  <td className="font-bold">
                    <Link href={`/admin/attendance?month=${month}&staff=${staff.id}`} className="underline">
                      {staff.name}
                    </Link>
                  </td>
                  <td className="text-right">{t.workDays}日</td>
                  <td className="text-right font-bold">{formatMinutes(t.netMinutes)}</td>
                  <td className="text-right">{t.lateCount}</td>
                  <td className="text-right">{t.earlyCount}</td>
                  <td className="text-right">{t.offShiftCount}</td>
                  <td className="text-right">{t.missingCount}</td>
                  <td>
                    {formatMinutes(overtime)}{" "}
                    {status === "over" ? <StatusBadge label="超過" tone="danger" /> : status === "warning" ? <StatusBadge label="注意" tone="warning" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="card">
          <h2 className="section-title">日別（{selected.staff.name}）</h2>
          {selected.days.length === 0 ? (
            <EmptyState message="この月の記録はありません" />
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>予定</th>
                    <th>出勤</th>
                    <th>退勤</th>
                    <th className="!text-right">実働</th>
                    <th>印</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.days
                    .filter((d) => d.planned.working || d.inAt || d.outAt)
                    .map((d) => (
                      <tr key={d.date}>
                        <td className="font-bold">{formatDateJa(d.date)}</td>
                        <td>{d.planned.working ? `${d.planned.start || "—"}〜${d.planned.end || "—"}` : "休み"}</td>
                        <td>
                          {d.inAt ? formatTimeJa(d.inAt) : "—"}
                          {d.inCorrected && "＊"}
                        </td>
                        <td>
                          {d.outAt ? formatTimeJa(d.outAt) : "—"}
                          {d.outCorrected && "＊"}
                        </td>
                        <td className="text-right font-bold">{minutesLabel(d.netMinutes)}</td>
                        <td className="space-x-1">
                          {d.late && <StatusBadge label={`遅刻${d.lateMinutes}分`} tone="warning" />}
                          {d.early && <StatusBadge label={`早退${d.earlyMinutes}分`} tone="warning" />}
                          {d.offShift && <StatusBadge label="シフト外" tone="pending" />}
                          {d.missing && <StatusBadge label="打刻なし" tone="danger" />}
                          {d.openPunch && <StatusBadge label="退勤なし" tone="danger" />}
                          {d.pendingCorrection && <StatusBadge label="修正の申請中" tone="muted" />}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-400 mt-2">＊は承認された打刻の修正で数えた時刻です。</p>
        </section>
      )}
    </div>
  );
}
