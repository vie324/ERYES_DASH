import { getDataStore } from "@/lib/data";
import { addMonths, formatMonthJa, thisMonthJst } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { getProductSettings, purchaseSummary } from "@/lib/orders";
import { MonthNav, PageHeader, EmptyState } from "@/components/ui";
import { Note } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// 依頼15：ウィッグ・社販の購入の、月ごと・人ごとの合計（管理者だけ。admin/layout.tsx で管理者に限っている）
export default async function AdminPurchasesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = isMonth(params.month ?? "") ? params.month! : thisMonthJst();
  const db = getDataStore();
  const [{ rows, byStaff }, staff, settings] = await Promise.all([purchaseSummary(month), db.listStaff(), getProductSettings(db)]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "（退職したスタッフ）";
  return (
    <div className="page-narrow">
      <PageHeader
        title="ウィッグ・社販の購入（全員）"
        backHref="/admin/features"
        backLabel="追加機能の設定へ戻る"
        icon="banknote"
        actions={
          <a href={`/api/admin/purchases-csv?month=${month}`} className="btn-ghost !text-xs">
            CSV
          </a>
        }
      />
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/admin/purchases?month=${addMonths(month, -1)}`} nextHref={`/admin/purchases?month=${addMonths(month, 1)}`} />
      <Note tone={settings.payrollDeduction ? "warn" : "muted"}>
        {settings.payrollDeduction
          ? "給与から差し引く運用になっています。労使協定（賃金控除の協定）を結んでいるか、ENiで確認してください。"
          : "給与から差し引く運用にする場合は、労使協定（賃金控除の協定）が必要です。ENiで確認してから、商品の一覧の設定で切り替えてください。"}
      </Note>
      {byStaff.size === 0 ? (
        <div className="mt-4">
          <EmptyState message="この月の購入はありません" />
        </div>
      ) : (
        <>
          <div className="table-wrap mt-4">
            <table className="table-base">
              <thead>
                <tr>
                  <th>名前</th>
                  <th className="!text-right">点数</th>
                  <th className="!text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {[...byStaff.entries()].map(([id, v]) => (
                  <tr key={id}>
                    <td className="font-bold">{nameOf(id)}</td>
                    <td className="text-right">{v.count}</td>
                    <td className="text-right font-bold">{v.total.toLocaleString()}円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-title mt-5">明細</h2>
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span className="w-12 text-ink-500">{r.purchasedOn.slice(5)}</span>
                <span className="flex-1 truncate">
                  {nameOf(r.staffId)}：{r.itemName} × {r.quantity}
                </span>
                <span className="tabular-nums">{r.total.toLocaleString()}円</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
