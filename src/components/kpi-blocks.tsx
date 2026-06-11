// KPI表示の共通部品（スタッフの成績画面・管理者ダッシュボードで共用）

import { formatMonthJa } from "@/lib/date";
import { formatPercent, formatYen, type KpiSummary } from "@/lib/kpi";
import { StatCard } from "@/components/ui";

export function KpiCards({ kpi }: { kpi: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="売上合計（技術＋OP＋物販）" value={formatYen(kpi.totalSales)} tone="accent" />
      <StatCard
        label="次回予約率"
        value={formatPercent(kpi.rebookRate)}
        sub={`予約${kpi.nextBookings}件 ÷ 施術${kpi.totalClients}人`}
      />
      <StatCard
        label="施術人数"
        value={`${kpi.totalClients}人`}
        sub={`新規${kpi.newClients}人 ／ 既存${kpi.repeatClients}人`}
      />
      <StatCard
        label="新規構成比"
        value={formatPercent(kpi.newRate)}
        sub={`既存 ${formatPercent(kpi.newRate === null ? null : 1 - kpi.newRate)}`}
      />
    </div>
  );
}

export function SalesBreakdownCard({ kpi }: { kpi: KpiSummary }) {
  return (
    <div className="card">
      <h2 className="font-bold text-sm text-stone-500 mb-2">売上内訳</h2>
      <dl className="text-sm space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-stone-500">技術売上</dt>
          <dd className="font-bold">{formatYen(kpi.serviceSales)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">オプション売上</dt>
          <dd className="font-bold">{formatYen(kpi.optionSales)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">物販売上</dt>
          <dd className="font-bold">{formatYen(kpi.retailSales)}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-200 pt-1.5">
          <dt className="font-bold">合計</dt>
          <dd className="font-bold text-rose-600">{formatYen(kpi.totalSales)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** 月次推移テーブル（新規/既存の構成比と売上・予約率の推移） */
export function MonthlyTrendTable({ rows }: { rows: { month: string; kpi: KpiSummary }[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-stone-400">データがありません</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>月</th>
            <th className="!text-right">売上合計</th>
            <th className="!text-right">施術人数</th>
            <th className="!text-right">新規比</th>
            <th className="!text-right">予約率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ month, kpi }) => (
            <tr key={month}>
              <td className="font-bold">{formatMonthJa(month)}</td>
              <td className="text-right font-bold">{formatYen(kpi.totalSales)}</td>
              <td className="text-right">
                {kpi.totalClients}人
                <span className="text-stone-400 text-xs">
                  （新{kpi.newClients}/既{kpi.repeatClients}）
                </span>
              </td>
              <td className="text-right">{formatPercent(kpi.newRate)}</td>
              <td className="text-right">{formatPercent(kpi.rebookRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
