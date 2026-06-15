import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst } from "@/lib/date";
import { formatPercent, formatYen, summarize, summarizeByMonth, summarizeByStaff } from "@/lib/kpi";
import { KpiCards, MonthlyTrendTable, SalesBreakdownCard } from "@/components/kpi-blocks";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";

// 全スタッフの成績・日報（管理者用）。
// 月間サマリーはサロンボードとの突合用：割引が反映された本システムの数値を「正」とする。
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; staff?: string; saved?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const savedMsg =
    params.saved === "report"
      ? "日報を修正しました"
      : params.saved === "report_deleted"
        ? "日報を削除しました"
        : "";

  const db = getDataStore();
  const [monthReports, staffList, trendReports, cashReports, stores] = await Promise.all([
    db.listDailyReports({ from, to }),
    db.listStaff(),
    db.listDailyReports({ from: monthRange(addMonths(month, -5)).from, to }),
    db.listCashReports({ from, to }),
    db.listStores(),
  ]);

  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const cashTotals = cashReports.reduce(
    (acc, r) => ({ cashSales: acc.cashSales + r.cashSales, bankDeposit: acc.bankDeposit + r.bankDeposit }),
    { cashSales: 0, bankDeposit: 0 }
  );
  const totalKpi = summarize(monthReports);
  const byStaff = summarizeByStaff(monthReports);
  const trend = summarizeByMonth(trendReports);

  const selectedStaff = params.staff && staffMap.has(params.staff) ? params.staff : "";
  const dailyReports = selectedStaff
    ? monthReports.filter((r) => r.staffId === selectedStaff)
    : monthReports;

  const staffQuery = selectedStaff ? `&staff=${selectedStaff}` : "";

  return (
    <div>
      <PageHeader title="成績・日報" backHref="/admin" />
      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {savedMsg}
        </p>
      )}
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/admin/reports?month=${addMonths(month, -1)}${staffQuery}`}
        nextHref={`/admin/reports?month=${addMonths(month, 1)}${staffQuery}`}
      />

      <div className="space-y-4">
        <section>
          <h2 className="font-bold text-sm text-stone-500 mb-2">
            月間サマリー（{formatDateJa(from)}〜{formatDateJa(to)}の合計）
          </h2>
          <KpiCards kpi={totalKpi} />
          <p className="text-xs text-stone-500 mt-2">
            ※ サロンボードの集計と突合する際は、割引が反映された本システムの数値を正としてください。
          </p>
        </section>

        <SalesBreakdownCard kpi={totalKpi} />

        <section className="card">
          <h2 className="font-bold text-sm text-stone-500 mb-2">スタッフ別（{formatMonthJa(month)}）</h2>
          {byStaff.size === 0 ? (
            <p className="text-sm text-stone-400">この月の日報はまだありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th className="!text-right">施術</th>
                    <th className="!text-right">新規/既存</th>
                    <th className="!text-right">予約率</th>
                    <th className="!text-right">売上合計</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byStaff.entries()].map(([staffId, kpi]) => (
                    <tr key={staffId}>
                      <td className="font-bold">{staffMap.get(staffId)?.name ?? "（不明）"}</td>
                      <td className="text-right">{kpi.totalClients}人</td>
                      <td className="text-right">
                        {kpi.newClients}/{kpi.repeatClients}
                      </td>
                      <td className="text-right">{formatPercent(kpi.rebookRate)}</td>
                      <td className="text-right font-bold">{formatYen(kpi.totalSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h2 className="font-bold text-sm text-stone-500">レジ締め・現金管理（{formatMonthJa(month)}）</h2>
            <span className="text-xs font-bold text-stone-500">
              現金売上計 {formatYen(cashTotals.cashSales)} ／ 銀行預入計 {formatYen(cashTotals.bankDeposit)}
            </span>
          </div>
          {cashReports.length === 0 ? (
            <p className="text-sm text-stone-400">
              この月のレジ締め入力はまだありません（スタッフ画面の「レジ締め・現金管理」から入力できます）
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>店舗</th>
                    <th className="!text-right">現金売上</th>
                    <th className="!text-right">レジ残高</th>
                    <th className="!text-right">おつり準備金</th>
                    <th className="!text-right">金庫へ移動</th>
                    <th className="!text-right">金庫残高</th>
                    <th className="!text-right">銀行預入</th>
                    <th>メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {cashReports.map((r) => {
                    // 検算：レジ残高 ＝ おつり準備金 ＋ 金庫へ移動 とズレている行に印を付ける
                    const diff = r.registerBalance - (r.changeFund + r.movedToSafe);
                    return (
                      <tr key={r.id}>
                        <td className="font-bold">{r.reportDate.slice(5).replace("-", "/")}</td>
                        <td>{storeMap.get(r.storeId)?.name.replace(/^EREYS\s*/, "") ?? "？"}</td>
                        <td className="text-right font-bold">{formatYen(r.cashSales)}</td>
                        <td className="text-right">
                          {formatYen(r.registerBalance)}
                          {diff !== 0 && (
                            <span className="block text-[10px] font-bold text-red-600">
                              差額{formatYen(Math.abs(diff))}
                            </span>
                          )}
                        </td>
                        <td className="text-right">{formatYen(r.changeFund)}</td>
                        <td className="text-right">{formatYen(r.movedToSafe)}</td>
                        <td className="text-right">{formatYen(r.safeBalance)}</td>
                        <td className="text-right">{r.bankDeposit > 0 ? formatYen(r.bankDeposit) : "−"}</td>
                        <td className="max-w-32 truncate text-stone-500">{r.memo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-stone-400 mt-2">
            ※「差額」＝レジ残高が「おつり準備金＋金庫へ移動額」と合わない場合の表示です。
          </p>
        </section>

        <section className="card">
          <h2 className="font-bold text-sm text-stone-500 mb-2">サロン全体の月次推移（直近6ヶ月）</h2>
          <MonthlyTrendTable rows={trend} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <h2 className="font-bold text-sm text-stone-500">日別明細</h2>
            <div className="flex gap-1.5 flex-wrap">
              <Link
                href={`/admin/reports?month=${month}`}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${!selectedStaff ? "bg-brand-600 text-white border-brand-600" : "border-stone-300 text-stone-600"}`}
              >
                全員
              </Link>
              {staffList.map((s) => (
                <Link
                  key={s.id}
                  href={`/admin/reports?month=${month}&staff=${s.id}`}
                  className={`text-xs font-bold rounded-full px-3 py-1.5 border ${selectedStaff === s.id ? "bg-brand-600 text-white border-brand-600" : "border-stone-300 text-stone-600"}`}
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
          {dailyReports.length === 0 ? (
            <EmptyState message="日報がありません" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>スタッフ</th>
                    <th className="!text-right">新規</th>
                    <th className="!text-right">既存</th>
                    <th className="!text-right">予約</th>
                    <th className="!text-right">技術</th>
                    <th className="!text-right">OP</th>
                    <th className="!text-right">物販</th>
                    <th className="!text-right">合計</th>
                    <th>メモ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReports.map((r) => (
                    <tr key={r.id}>
                      <td className="font-bold">{r.reportDate.slice(5).replace("-", "/")}</td>
                      <td>{staffMap.get(r.staffId)?.name ?? "（不明）"}</td>
                      <td className="text-right">{r.newClients}</td>
                      <td className="text-right">{r.repeatClients}</td>
                      <td className="text-right">{r.nextBookings}</td>
                      <td className="text-right">{formatYen(r.serviceSales)}</td>
                      <td className="text-right">{formatYen(r.optionSales)}</td>
                      <td className="text-right">{formatYen(r.retailSales)}</td>
                      <td className="text-right font-bold">
                        {formatYen(r.serviceSales + r.optionSales + r.retailSales)}
                      </td>
                      <td className="max-w-40 truncate text-stone-500">{r.memo}</td>
                      <td>
                        <Link
                          href={`/admin/reports/${r.id}?month=${month}`}
                          className="text-xs font-bold text-brand-700 underline whitespace-nowrap"
                        >
                          修正
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
