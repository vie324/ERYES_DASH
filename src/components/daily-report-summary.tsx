// イーリスの日報（daily_reports）1件の中身の表示（読み取り専用）。
// 日報へのコメントのスレッド・コメントする人の一覧で同じ見せ方にする。

import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import type { DailyReport } from "@/lib/data/types";

export function DailyReportSummary({ report, compact = false }: { report: DailyReport; compact?: boolean }) {
  const total = report.serviceSales + report.optionSales + report.retailSales;
  const rows = [
    { label: "喜んでいただけたこと", text: report.goodPoint, tone: "text-brand-700" },
    { label: "気付き・改善点", text: report.improvement, tone: "text-brand-700" },
    { label: "ひとこと", text: report.message, tone: "text-brand-700" },
    { label: "メモ", text: report.memo, tone: "text-ink-400" },
  ].filter((r) => r.text);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
        <span>新規 {report.newClients}・既存 {report.repeatClients}</span>
        <span>次回予約 {report.nextBookings}</span>
        <span className="font-bold text-ink-900">売上 {formatYen(total)}</span>
      </div>
      {rows.length > 0 && (
        <dl className="space-y-2 text-sm border-t border-ink-100 pt-2">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className={`text-xs font-bold ${r.tone}`}>{r.label}</dt>
              <dd className={`whitespace-pre-wrap text-ink-700 ${compact ? "line-clamp-3" : ""}`}>{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** 「11月14日(土)」のような日付（日報の見出し用） */
export function reportDateLabel(report: DailyReport): string {
  return formatDateJa(report.reportDate, true);
}
