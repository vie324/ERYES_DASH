import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

// 顧客一覧（LINE友だち追加で自動登録されたお客様）。名前で検索できる
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const db = getDataStore();

  const [customers, pendingCounseling] = await Promise.all([
    db.listCustomers(q),
    db.listCounselingResponses({ status: "pending" }),
  ]);
  const pendingCustomerIds = new Set(pendingCounseling.map((c) => c.customerId));

  return (
    <div>
      <PageHeader title="顧客一覧" backHref="/admin" />

      <form method="GET" className="flex gap-2 mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="お名前で検索"
          className="input flex-1"
        />
        <button type="submit" className="btn-secondary shrink-0">
          検索
        </button>
      </form>

      <p className="text-xs text-stone-500 mb-3">
        {q ? `「${q}」の検索結果：${customers.length}名` : `登録顧客：${customers.length}名`}
        ／ 顧客はLINE友だち追加時に自動で登録されます
      </p>

      {customers.length === 0 ? (
        <EmptyState message="該当する顧客がいません" />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/admin/customers/${c.id}`}
              className="card flex items-center gap-3 active:bg-rose-50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{c.fullName} 様</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  登録：{formatDateTimeJa(c.createdAt, true)}
                </p>
              </div>
              {pendingCustomerIds.has(c.id) && <StatusBadge label="未確認あり" tone="pending" />}
              {!c.lineUserId && <StatusBadge label="LINE未連携" tone="muted" />}
              <span className="text-stone-300 text-xl">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
