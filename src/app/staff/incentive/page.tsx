import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { addMonths, formatDateJa, formatMonthJa, thisMonthJst } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { formatYen } from "@/lib/kpi";
import { incentiveReport, STATUS_LABEL } from "@/lib/required-inputs/incentive";
import { MonthNav, PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { requestRescueAction } from "./actions";

export const dynamic = "force-dynamic";

const TONE = { ontime: "ok", late: "warning", missing: "danger", rescued: "ok", pending_rescue: "pending" } as const;

// 依頼14：自分のインセンティブに使われるデータ（締め日までに入力したものだけ）。締め日後の分は救済を申請できる。
export default async function MyIncentivePage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const month = isMonth(params.month ?? "") ? params.month! : addMonths(thisMonthJst(), -1);
  const { deadline, summaries } = await incentiveReport(getDataStore(), month, [v.staffId]);
  const mine = summaries.find((s) => s.staffId === v.staffId);
  return (
    <div className="page-narrow">
      <PageHeader title="インセンティブに使う入力" backHref="/staff" icon="checkCircle" />
      <Flash ok={params.ok} error={params.error} />
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/staff/incentive?month=${addMonths(month, -1)}`} nextHref={`/staff/incentive?month=${addMonths(month, 1)}`} />
      <Note>
        {formatMonthJa(month)}分の締め日は <span className="font-bold">{formatDateJa(deadline)}</span> です。締め日までに入力したものだけがインセンティブの計算に使われます。
        締め日のあとに入れた分は、理由を書いて申請し、管理者が認めれば入ります。基本給など、インセンティブ以外の給与には関係ありません。
      </Note>
      {!mine || mine.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="この月の対象の入力はありません" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 my-4 text-center">
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">使われる</p>
              <p className="font-bold text-emerald-700">{mine.counts.ontime + mine.counts.rescued}件</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">締め日のあと・未入力</p>
              <p className="font-bold text-red-600">{mine.counts.late + mine.counts.missing}件</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">使われる売上</p>
              <p className="font-bold">{formatYen(mine.eligibleSales)}</p>
            </div>
          </div>
          <ul className="space-y-2">
            {mine.items
              .filter((i) => i.status !== "ontime")
              .map((i) => (
                <li key={`${i.key}-${i.date}`} className="card !p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold flex-1">
                      {formatDateJa(i.date)}の{i.label}
                    </span>
                    <StatusBadge label={STATUS_LABEL[i.status]} tone={TONE[i.status]} />
                  </div>
                  {i.status === "late" && (
                    <form action={requestRescueAction} className="flex gap-2 mt-2">
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="key" value={i.key} />
                      <input type="hidden" name="date" value={i.date} />
                      <input name="reason" required maxLength={300} className="input flex-1 !min-h-10 !py-1.5 !text-sm" placeholder="遅れた理由（例：アプリに入れたつもりだった）" />
                      <button type="submit" className="btn-secondary btn-sm shrink-0">
                        救済を申請
                      </button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
          <p className="text-xs text-ink-500 mt-3">締め日までに入力したもの（{mine.counts.ontime}件）は一覧から省いています。</p>
        </>
      )}
    </div>
  );
}
