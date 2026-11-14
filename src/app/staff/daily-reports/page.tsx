import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatMonthJa, monthRange, thisMonthJst } from "@/lib/date";
import { isReportReviewer, reportThreadHref, reviewableStaff } from "@/lib/eyes/report-comments";
import { shortStoreName } from "@/lib/shift/month";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { DailyReportSummary, reportDateLabel } from "@/components/daily-report-summary";

// 日報へのコメント（コメントする人の一覧）。
// 管理者はすべての店舗、店舗の管理者は担当店舗のスタッフの日報だけが出る（判定はロールと担当店舗。名前では判定しない）。
// それ以外の人はURLを直接開いてもホームへ戻す。
export default async function DailyReportsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string; filter?: string }>;
}) {
  const session = await requireSession();
  const db = getDataStore();
  const me = await db.getStaff(session.staffId);
  if (!me || !isReportReviewer(me)) redirect("/staff");

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const [staffList, stores, reports] = await Promise.all([db.listStaff(), db.listStores(), db.listDailyReports({ from, to })]);

  const targets = reviewableStaff(me, staffList);
  const targetIds = new Set(targets.map((s) => s.id));
  // 店舗で絞る（担当店舗が複数あるとき）
  const storeIds = [...new Set(targets.map((s) => s.storeId))].filter((id) => stores.some((st) => st.id === id));
  const storeFilter = storeIds.includes(params.store ?? "") ? params.store! : "";
  const visible = reports
    .filter((r) => targetIds.has(r.staffId))
    .filter((r) => !storeFilter || staffList.find((s) => s.id === r.staffId)?.storeId === storeFilter)
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.staffId.localeCompare(b.staffId));
  const comments = await db.listDailyReportComments(visible.map((r) => r.id));
  const countOf = (reportId: string) => comments.filter((c) => c.reportId === reportId).length;
  const uncommented = visible.filter((r) => countOf(r.id) === 0);
  const onlyUncommented = params.filter === "todo";
  const shown = onlyUncommented ? uncommented : visible;

  const nameOf = (staffId: string) => staffList.find((s) => s.id === staffId)?.name ?? "（不明）";
  const storeLabel = (storeId: string) => shortStoreName(stores.find((s) => s.id === storeId)?.name ?? "") || "店舗";
  const query = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ month, ...(storeFilter ? { store: storeFilter } : {}), ...(onlyUncommented ? { filter: "todo" } : {}), ...patch });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/staff/daily-reports?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="日報へのコメント"
        backHref="/staff"
        description={
          me.role === "admin"
            ? "スタッフの日報を見て、コメントを送れます。コメントすると本人に通知が届き、本人は返信できます。"
            : "担当店舗のスタッフの日報を見て、コメントを送れます。コメントすると本人に通知が届き、本人は返信できます。"
        }
      />
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={query({ month: addMonths(month, -1) })}
        nextHref={query({ month: addMonths(month, 1) })}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={query({ filter: "" })} className={`chip ${!onlyUncommented ? "chip-active" : ""}`}>
          すべて（{visible.length}）
        </Link>
        <Link href={query({ filter: "todo" })} className={`chip ${onlyUncommented ? "chip-active" : ""}`}>
          まだコメントなし（{uncommented.length}）
        </Link>
        {storeIds.length > 1 && (
          <>
            <span className="w-px h-5 bg-ink-200 mx-1" aria-hidden="true" />
            <Link href={query({ store: "" })} className={`chip ${!storeFilter ? "chip-active" : ""}`}>
              全店舗
            </Link>
            {storeIds.map((id) => (
              <Link key={id} href={query({ store: id })} className={`chip ${storeFilter === id ? "chip-active" : ""}`}>
                {storeLabel(id)}
              </Link>
            ))}
          </>
        )}
      </div>

      {targets.length === 0 ? (
        <EmptyState message="担当店舗にスタッフがいません（マスタ設定で担当店舗を確かめてください）" />
      ) : shown.length === 0 ? (
        <EmptyState message={onlyUncommented ? "この月の日報には、すべてコメントがついています" : "この月の日報はまだありません"} />
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const count = countOf(r.id);
            const author = staffList.find((s) => s.id === r.staffId);
            return (
              <Link key={r.id} href={reportThreadHref(r.id)} className="card card-tappable block space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold flex-1 min-w-0 truncate">
                    {nameOf(r.staffId)}
                    <span className="text-xs text-ink-500 font-normal ml-2">{reportDateLabel(r)}</span>
                  </p>
                  {storeIds.length > 1 && author && <StatusBadge label={storeLabel(author.storeId)} tone="muted" />}
                  {count > 0 ? (
                    <StatusBadge label={`コメント ${count}件`} tone="ok" />
                  ) : (
                    <StatusBadge label="まだコメントなし" tone="pending" />
                  )}
                </div>
                <DailyReportSummary report={r} compact />
                <p className="text-xs font-bold text-brand-700">{count > 0 ? "コメントを見る・続ける ›" : "コメントする ›"}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
