import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatMonthJa, monthRange, thisMonthJst } from "@/lib/date";
import { formatYen, summarize, summarizeByMonth } from "@/lib/kpi";
import { KpiCards, MonthlyTrendTable, SalesBreakdownCard } from "@/components/kpi-blocks";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";

// 自分の成績：当月KPI＋日別一覧＋直近6ヶ月の推移
export default async function StaffStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);

  const db = getDataStore();
  const [monthReports, trendReports] = await Promise.all([
    db.listDailyReports({ staffId: session.staffId, from, to }),
    db.listDailyReports({
      staffId: session.staffId,
      from: monthRange(addMonths(month, -5)).from,
      to,
    }),
  ]);

  const kpi = summarize(monthReports);
  const trend = summarizeByMonth(trendReports);

  return (
    <div>
      <PageHeader title="自分の成績" backHref="/staff" />
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/stats?month=${addMonths(month, -1)}`}
        nextHref={`/staff/stats?month=${addMonths(month, 1)}`}
      />

      {monthReports.length === 0 ? (
        <EmptyState message="この月の日報はまだありません" />
      ) : (
        <div className="space-y-4">
          <KpiCards kpi={kpi} />
          <SalesBreakdownCard kpi={kpi} />

          <section className="card">
            <h2 className="font-bold text-sm text-stone-500 mb-2">日別の入力内容</h2>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th className="!text-right">新規</th>
                    <th className="!text-right">既存</th>
                    <th className="!text-right">予約</th>
                    <th className="!text-right">売上合計</th>
                  </tr>
                </thead>
                <tbody>
                  {monthReports.map((r) => (
                    <tr key={r.id}>
                      <td className="font-bold">{r.reportDate.slice(8)}日</td>
                      <td className="text-right">{r.newClients}</td>
                      <td className="text-right">{r.repeatClients}</td>
                      <td className="text-right">{r.nextBookings}</td>
                      <td className="text-right font-bold">
                        {formatYen(r.serviceSales + r.optionSales + r.retailSales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <section className="card mt-4">
        <h2 className="font-bold text-sm text-stone-500 mb-2">月次推移（直近6ヶ月）</h2>
        <MonthlyTrendTable rows={trend} />
      </section>
    </div>
  );
}
