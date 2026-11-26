import { getDataStore } from "@/lib/data";
import { fx, shiftChangeLogs } from "@/lib/data/tables";
import { addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, thisMonthJst } from "@/lib/date";
import { describeCell } from "@/lib/shift/extras";
import { isMonth } from "@/lib/action-utils";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";
import { NotReadyNotice } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// 依頼12：公開後のシフトの変更の履歴（誰の・どの日を・どう変えたか・誰が変えたか）
export default async function ShiftHistoryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = isMonth(params.month ?? "") ? params.month! : thisMonthJst();
  const [logs, staff] = await Promise.all([
    fx().shiftChangeLogs.list({ where: { month }, order: [["createdAt", "desc"]], limit: 500 }),
    getDataStore().listStaff(),
  ]);
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="page-narrow">
      <PageHeader title="シフトの変更の履歴" backHref={`/admin/schedule?month=${month}`} backLabel="シフトへ戻る" icon="fileText" description="公開したあとに変えた分だけを残しています" />
      <NotReadyNotice table={shiftChangeLogs} isAdmin />
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/admin/schedule/history?month=${addMonths(month, -1)}`} nextHref={`/admin/schedule/history?month=${addMonths(month, 1)}`} />
      {logs.length === 0 ? (
        <EmptyState message="この月の公開後の変更はありません" />
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>日</th>
                <th>スタッフ</th>
                <th>前</th>
                <th>後</th>
                <th>変えた人・日時</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="font-bold">{formatDateJa(l.date)}</td>
                  <td>{nameOf(l.staffId)}</td>
                  <td>{describeCell(l.before)}</td>
                  <td className="font-bold">{describeCell(l.after)}</td>
                  <td className="text-xs text-ink-500">
                    {nameOf(l.changedBy)}・{formatDateTimeJa(l.createdAt)}
                    {l.note && <span className="block">{l.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
