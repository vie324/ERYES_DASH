import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, formatWeekJa, monthRange, thisMonthJst } from "@/lib/date";
import { STYLIST_REPORT_ITEMS, WEEKLY_REPORT_ITEMS } from "@/lib/eni/forms";
import { isExecutive } from "@/lib/eni/access";
import { EniAnswersView } from "@/components/eni-form-fields";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";

// スタイリスト日報・アシスタント週報の閲覧（幹部・管理者のみ）
export default async function EniReportsViewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const tab = params.tab === "weekly" ? "weekly" : "stylist";
  const { from, to } = monthRange(month);

  const db = getDataStore();
  const [stylistReports, weeklyReports, staffList] = await Promise.all([
    db.listEniReports("stylist", { from, to }),
    db.listEniReports("weekly", { from, to }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  const reports = tab === "stylist" ? stylistReports : weeklyReports;
  const items = tab === "stylist" ? STYLIST_REPORT_ITEMS : WEEKLY_REPORT_ITEMS;

  return (
    <div>
      <PageHeader title="日報・週報を見る" backHref="/staff" />

      <div className="flex gap-1.5 mb-4">
        <a
          href={`/staff/eni-reports?month=${month}&tab=stylist`}
          className={`flex-1 text-center text-sm font-bold rounded-full px-3 py-2 border ${
            tab === "stylist"
              ? "bg-brand-600 text-white border-brand-600"
              : "border-stone-300 text-stone-600"
          }`}
        >
          スタイリスト日報（{stylistReports.length}）
        </a>
        <a
          href={`/staff/eni-reports?month=${month}&tab=weekly`}
          className={`flex-1 text-center text-sm font-bold rounded-full px-3 py-2 border ${
            tab === "weekly"
              ? "bg-brand-600 text-white border-brand-600"
              : "border-stone-300 text-stone-600"
          }`}
        >
          アシスタント週報（{weeklyReports.length}）
        </a>
      </div>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/eni-reports?month=${addMonths(month, -1)}&tab=${tab}`}
        nextHref={`/staff/eni-reports?month=${addMonths(month, 1)}&tab=${tab}`}
      />

      {reports.length === 0 ? (
        <EmptyState message={`この月の${tab === "stylist" ? "日報" : "週報"}はまだありません`} />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <p className="text-xs font-bold text-stone-500 mb-2">
                {tab === "stylist" ? formatDateJa(r.periodKey, true) : formatWeekJa(r.periodKey)} ／{" "}
                <span className="text-ink-900 text-sm">{staffMap.get(r.staffId) ?? "（不明）"}</span>
              </p>
              <EniAnswersView items={items} answers={r.answers} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
