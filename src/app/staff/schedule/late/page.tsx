import { getDataStore } from "@/lib/data";
import { fx, dayoffLateRequests } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { formatDateJa, todayJst } from "@/lib/date";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { cancelLateDayoffAction, requestLateDayoffAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS = { pending: ["承認待ち", "pending"], approved: ["承認", "ok"], rejected: ["見送り", "muted"] } as const;

// 依頼12：締切を過ぎた月の希望休は、店長の承認制。ここから申請し、結果は通知で届く。
export default async function LateDayoffPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();
  const [mine, rules] = await Promise.all([
    fx().dayoffLateRequests.list({ where: { staffId: v.staffId }, order: [["createdAt", "desc"]], limit: 30 }),
    db.getShiftRules(),
  ]);
  return (
    <div className="page-narrow">
      <PageHeader title="締切後の希望休" backHref="/staff/schedule" backLabel="シフトへ戻る" icon="calendar" />
      <NotReadyNotice table={dayoffLateRequests} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      <Note>
        希望休の締切は「対象の月の{rules.requestLeadMonths}か月前の{rules.requestDeadlineDay}日」です（例：3月分は12月{rules.requestDeadlineDay}日まで）。
        締切を過ぎた月の休みは、ここから申請して店長の承認をもらいます。承認されると、その日は休みになり、通知が届きます。
      </Note>
      <form action={requestLateDayoffAction} className="card space-y-3 mt-4">
        <div>
          <label className="label" htmlFor="late-date">
            休みたい日
          </label>
          <input id="late-date" name="date" type="date" min={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="late-reason">
            理由
          </label>
          <input id="late-reason" name="reason" className="input" maxLength={100} placeholder="例）家族の行事が急に決まった" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="paid_leave" className="w-4 h-4" />
          有休で休みたい
        </label>
        <ConfirmSubmit className="btn-primary w-full">店長に申請する</ConfirmSubmit>
      </form>
      <h2 className="section-title mt-6">申請したもの</h2>
      {mine.length === 0 ? (
        <EmptyState message="まだ申請はありません" />
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => (
            <li key={r.id} className="card !p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-900">
                  {formatDateJa(r.date)}
                  {r.paidLeave && "（有休）"}
                </p>
                <p className="text-xs text-ink-500 truncate">{r.reason || "理由なし"}{r.decisionNote && `／${r.decisionNote}`}</p>
              </div>
              <StatusBadge label={STATUS[r.status][0]} tone={STATUS[r.status][1]} />
              {r.status === "pending" && (
                <form action={cancelLateDayoffAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-xs text-red-500 underline">
                    取り下げ
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
