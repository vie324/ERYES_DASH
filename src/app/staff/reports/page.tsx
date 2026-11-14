import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";
import { reportThreadHref } from "@/lib/eyes/report-comments";
import { openNotificationHref } from "@/lib/inbox";

// 過去の日報をふりかえる（自分の日報を月別に一覧。数値＋メモ＋ふりかえりを表示）。
// 日報にコメント（店舗の管理者・管理者から）がついていれば件数を出し、タップでコメントを読んで返信できる。
export default async function StaffReportsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);

  const db = getDataStore();
  const reports = await db.listDailyReports({ staffId: session.staffId, from, to });
  const sorted = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  const [comments, notifications] = await Promise.all([
    db.listDailyReportComments(sorted.map((r) => r.id)),
    db.listAppNotifications(session.staffId, 50),
  ]);
  // まだ読んでいないコメントがある日報（お知らせが未読のもの）
  const unreadReportIds = new Set(notifications.filter((n) => n.readAt === null).map((n) => n.refId));

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
                {(() => {
                  const count = comments.filter((c) => c.reportId === r.id).length;
                  if (count === 0) return null;
                  const unread = unreadReportIds.has(r.id);
                  const cls = `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${
                    unread ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-800"
                  }`;
                  const label = (
                    <>
                      <span className="flex-1">
                        {unread ? "新しいコメントがあります" : `コメント ${count}件`}（タップして読む・返信する）
                      </span>
                      <span aria-hidden="true">›</span>
                    </>
                  );
                  // 未読は既読にしてから開く（ふつうのページ移動にして、ヘッダーのベルの数字もすぐ消す）
                  return unread ? (
                    <a href={openNotificationHref({ refId: r.id, href: reportThreadHref(r.id) })} className={cls}>
                      {label}
                    </a>
                  ) : (
                    <Link href={reportThreadHref(r.id)} className={cls}>
                      {label}
                    </Link>
                  );
                })()}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                  <span>新規 {r.newClients}・既存 {r.repeatClients}</span>
                  <span>次回予約 {r.nextBookings}</span>
                  <span className="font-bold text-ink-900">売上 {formatYen(total)}</span>
                </div>
                {hasComment && (
                  <dl className="space-y-2 text-sm border-t border-ink-100 pt-2">
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
                        <dt className="text-xs font-bold text-ink-400">メモ</dt>
                        <dd className="whitespace-pre-wrap text-ink-500">{r.memo}</dd>
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
