import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { CounselingStatusBadge, riskFlags } from "@/components/counseling-detail";
import { EmptyState, PageHeader } from "@/components/ui";

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "pending", label: "未確認" },
  { key: "confirmed", label: "確認済み" },
] as const;

// カウンセリング一覧（管理者用）：全回答をステータスで絞り込んで閲覧
export default async function AdminCounselingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; confirmed?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.status)?.key ?? "all") as
    | "all"
    | "pending"
    | "confirmed";
  const db = getDataStore();

  const [responses, customers] = await Promise.all([
    db.listCounselingResponses(filter === "all" ? undefined : { status: filter }),
    db.listCustomers(),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader title="カウンセリング" backHref="/admin" />

      {params.confirmed && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          確認済みにしました
        </p>
      )}

      <div className="flex gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/counseling${f.key === "all" ? "" : `?status=${f.key}`}`}
            className={`text-sm font-bold rounded-full px-4 py-2 border ${
              filter === f.key
                ? "bg-brand-600 text-white border-brand-600"
                : "border-stone-300 text-stone-600"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {responses.length === 0 ? (
        <EmptyState message="該当するカウンセリングはありません" />
      ) : (
        <div className="space-y-3">
          {responses.map((r) => {
            const flags = riskFlags(r.answers);
            return (
              <Link
                key={r.id}
                href={`/admin/counseling/${r.id}`}
                className="card flex items-center gap-3 active:bg-brand-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">
                    {customerMap.get(r.customerId)?.fullName ?? "（不明）"} 様
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {formatDateTimeJa(r.submittedAt, true)}
                  </p>
                  {flags.length > 0 && (
                    <p className="text-xs font-bold text-red-600 mt-1">要確認：{flags.join("・")}</p>
                  )}
                </div>
                <CounselingStatusBadge status={r.status} />
                <span className="text-stone-300 text-xl">›</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
