import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

// お客様のカルテ（顧客一覧）：スタッフが過去のお客様を名前で探し、初期カウンセリングを見返す入口。
export default async function StaffCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSession();
  const { q } = await searchParams;
  const db = getDataStore();

  const [customers, pendingCounseling] = await Promise.all([
    db.listCustomers(q),
    db.listCounselingResponses({ status: "pending" }),
  ]);
  const pendingCustomerIds = new Set(pendingCounseling.map((c) => c.customerId));

  return (
    <div>
      <PageHeader title="お客様のカルテ" backHref="/staff" />

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

      <p className="text-xs text-ink-500 mb-3">
        {q ? `「${q}」の検索結果：${customers.length}名` : `登録顧客：${customers.length}名`}
        ／ お名前をタップすると過去のカウンセリング（カルテ）を見られます
      </p>

      {customers.length === 0 ? (
        <EmptyState message="該当するお客様がいません" />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/staff/customers/${c.id}`}
              className="card flex items-center gap-3 active:bg-brand-50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{c.fullName} 様</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  登録：{formatDateTimeJa(c.createdAt, true)}
                </p>
              </div>
              {pendingCustomerIds.has(c.id) && <StatusBadge label="未確認あり" tone="pending" />}
              <span className="text-ink-300 text-xl">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
