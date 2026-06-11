import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { riskFlags, CounselingStatusBadge } from "@/components/counseling-detail";
import { EmptyState, PageHeader } from "@/components/ui";
import type { CounselingResponse, Customer } from "@/lib/data/types";

function CounselingListItem({
  response,
  customer,
}: {
  response: CounselingResponse;
  customer: Customer | undefined;
}) {
  const flags = riskFlags(response.answers);
  return (
    <Link
      href={`/staff/counseling/${response.id}`}
      className="card flex items-center gap-3 active:bg-rose-50"
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-base truncate">{customer?.fullName ?? "（不明）"} 様</p>
        <p className="text-xs text-stone-500 mt-0.5">{formatDateTimeJa(response.submittedAt)}</p>
        {flags.length > 0 && (
          <p className="text-xs font-bold text-red-600 mt-1">⚠ {flags.join("・")}</p>
        )}
      </div>
      <CounselingStatusBadge status={response.status} />
      <span className="text-stone-300 text-xl">›</span>
    </Link>
  );
}

// カウンセリング一覧：接客前にiPadで確認する画面。未確認を上に大きく出す
export default async function StaffCounselingPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const db = getDataStore();

  const [pending, confirmed, customers] = await Promise.all([
    db.listCounselingResponses({ status: "pending" }),
    db.listCounselingResponses({ status: "confirmed" }),
    db.listCustomers(),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const recentConfirmed = confirmed.slice(0, 10);

  return (
    <div>
      <PageHeader title="カウンセリング確認" backHref="/staff" />

      {params.confirmed && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          確認済みにしました
        </p>
      )}

      <section className="mb-6">
        <h2 className="font-bold text-sm text-stone-500 mb-2">
          未確認（{pending.length}件）
        </h2>
        {pending.length === 0 ? (
          <EmptyState message="未確認のカウンセリングはありません" />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <CounselingListItem key={r.id} response={r} customer={customerMap.get(r.customerId)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold text-sm text-stone-500 mb-2">確認済み（直近10件）</h2>
        {recentConfirmed.length === 0 ? (
          <EmptyState message="確認済みのカウンセリングはまだありません" />
        ) : (
          <div className="space-y-3">
            {recentConfirmed.map((r) => (
              <CounselingListItem key={r.id} response={r} customer={customerMap.get(r.customerId)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
