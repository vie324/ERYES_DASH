import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, thisMonthJst } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { formatYen } from "@/lib/kpi";
import { incentiveReport } from "@/lib/required-inputs/incentive";
import { MonthNav, PageHeader, EmptyState } from "@/components/ui";
import { Note } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// 依頼14：インセンティブに使うデータの一覧（管理者だけ）。締め日までに入力・確認されたものと、救済で認めたものだけを数える。
export default async function AdminIncentivePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = isMonth(params.month ?? "") ? params.month! : addMonths(thisMonthJst(), -1);
  const db = getDataStore();
  const [{ deadline, summaries }, staff] = await Promise.all([incentiveReport(db, month), db.listStaff()]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="page-narrow">
      <PageHeader
        title="インセンティブに使うデータ"
        backHref="/admin/required-inputs"
        backLabel="設定へ戻る"
        icon="barChart"
        actions={
          <a href={`/api/admin/incentive-csv?month=${month}`} className="btn-ghost !text-xs">
            CSV
          </a>
        }
      />
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/admin/incentive?month=${addMonths(month, -1)}`} nextHref={`/admin/incentive?month=${addMonths(month, 1)}`} />
      <Note>
        締め日：{formatDateJa(deadline)}。金額の計算式はまだ決まっていないため、使ってよいデータの件数と売上の合計までを出しています（TODO）。
        基本給など、インセンティブ以外の給与には影響しません。
      </Note>
      {summaries.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="この月の対象の入力はありません" />
        </div>
      ) : (
        <div className="table-wrap mt-4">
          <table className="table-base">
            <thead>
              <tr>
                <th>名前</th>
                <th className="!text-right">締め日まで</th>
                <th className="!text-right">救済</th>
                <th className="!text-right">締め日のあと</th>
                <th className="!text-right">未入力</th>
                <th className="!text-right">使う売上</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.staffId}>
                  <td className="font-bold">{nameOf(s.staffId)}</td>
                  <td className="text-right">{s.counts.ontime}</td>
                  <td className="text-right">{s.counts.rescued}</td>
                  <td className="text-right text-amber-700">{s.counts.late + s.counts.pending_rescue}</td>
                  <td className="text-right text-red-600">{s.counts.missing}</td>
                  <td className="text-right font-bold">{formatYen(s.eligibleSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
