import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";

// 過去の日報をふりかえる（自分の日報を月別に一覧。数値＋メモ＋ふりかえりを表示）
export default async function StaffReportsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);

  const reports = await getDataStore().listDailyReports({ staffId: session.staffId, from, to });
  const sorted = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));

  return (
    <div>
      <PageHeader title="過去の日報をふりかえる" backHref="/staff" />
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/reports?month=${addMonths(month, -1)}`}
        nextHref={`/staff/reports?month=${addMonths(month, 1)}`}
      />

      {sorted.length === 0 ? (
        <EmptyState message="この月の日報はまだありません" />
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const total = r.serviceSales + r.optionSales + r.retailSales;
            const hasComment = r.goodPoint || r.improvement || r.message || r.memo;
            return (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{formatDateJa(r.reportDate, true)}</p>
                  <Link
                    href={`/staff/report?date=${r.reportDate}`}
                    className="text-xs font-bold text-brand-700 underline whitespace-nowrap"
                  >
                    修正する
                  </Link>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                  <span>新規 {r.newClients}・既存 {r.repeatClients}</span>
                  <span>次回予約 {r.nextBookings}</span>
                  <span className="font-bold text-ink-900">売上 {formatYen(total)}</span>
                </div>
                {hasComment && (
                  <dl className="space-y-2 text-sm border-t border-stone-100 pt-2">
                    {r.goodPoint && (
                      <div>
                        <dt className="text-xs font-bold text-brand-700">喜んでいただけたこと</dt>
                        <dd className="whitespace-pre-wrap text-ink-700">{r.goodPoint}</dd>
                      </div>
                    )}
                    {r.improvement && (
                      <div>
                        <dt className="text-xs font-bold text-brand-700">気付き・改善点</dt>
                        <dd className="whitespace-pre-wrap text-ink-700">{r.improvement}</dd>
                      </div>
                    )}
                    {r.message && (
                      <div>
                        <dt className="text-xs font-bold text-brand-700">ひとこと</dt>
                        <dd className="whitespace-pre-wrap text-ink-700">{r.message}</dd>
                      </div>
                    )}
                    {r.memo && (
                      <div>
                        <dt className="text-xs font-bold text-stone-400">メモ</dt>
                        <dd className="whitespace-pre-wrap text-stone-500">{r.memo}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
