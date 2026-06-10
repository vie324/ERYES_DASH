import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa, formatMonthJa } from "@/lib/date";
import { currentTargetMonth, deadlineLabel, isRequestEditable } from "@/lib/shift/period";
import { PageHeader } from "@/components/ui";
import { ShiftRequestForm } from "./request-form";
import type { ShiftPreference } from "@/lib/data/types";

// シフト希望の提出（提出内容は本人と管理者のみ閲覧可。締切までは何度でも修正できる）
export default async function ShiftRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const rules = await db.getShiftRules();

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentTargetMonth(rules);
  const editable = isRequestEditable(month, rules);

  const [stores, requestMonth, requests, availableStores] = await Promise.all([
    db.listStores(),
    db.getShiftRequestMonth(session.staffId, month),
    db.listShiftRequests(month, session.staffId),
    db.listAvailableStores(month, session.staffId),
  ]);

  const initialDays: Record<string, ShiftPreference> = {};
  for (const r of requests) initialDays[r.date] = r.preference;

  return (
    <div>
      <PageHeader
        title={`${formatMonthJa(month)}の希望提出`}
        backHref="/staff/shift"
        backLabel="シフトへ戻る"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          提出しました。締切までは何度でも修正できます。
        </p>
      )}
      {params.error === "deadline" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          締切を過ぎているため提出できませんでした。管理者にご相談ください。
        </p>
      )}

      <div className="rounded-xl bg-stone-100 text-stone-600 text-xs font-bold px-4 py-3 mb-4 space-y-0.5">
        <p>締切：{deadlineLabel(month, rules)}　{editable ? "（提出・修正できます）" : "（締切済みのため閲覧のみ）"}</p>
        {requestMonth && <p>前回の提出：{formatDateTimeJa(requestMonth.updatedAt, true)}</p>}
        <p>提出内容はあなたと管理者だけが見られます。</p>
      </div>

      <ShiftRequestForm
        targetMonth={month}
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        initialDays={initialDays}
        initialStoreIds={availableStores.map((a) => a.storeId)}
        initialNote={requestMonth?.note ?? ""}
        editable={editable}
      />
    </div>
  );
}
