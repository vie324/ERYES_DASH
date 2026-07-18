import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { riskFlags, CounselingStatusBadge } from "@/components/counseling-detail";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

// お客様のカルテ詳細（スタッフ用・読み取り）：そのお客様の初期カウンセリング〜これまでの回答を一覧。
export default async function StaffCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const db = getDataStore();

  const customer = await db.getCustomer(id);
  if (!customer) notFound();

  // 送信の古い順（初期カウンセリングが先頭）
  const counseling = (await db.listCounselingResponses({ customerId: id }))
    .slice()
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

  return (
    <div>
      <PageHeader title="お客様のカルテ" backHref="/staff/customers" backLabel="お客様一覧へ戻る" />

      <div className="card mb-4">
        <p className="text-lg font-bold">{customer.fullName} 様</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
          <span>登録：{formatDateTimeJa(customer.createdAt, true)}</span>
          {customer.lineUserId ? (
            <StatusBadge label="LINE連携済み" tone="ok" />
          ) : (
            <StatusBadge label="LINE未連携" tone="muted" />
          )}
        </div>
      </div>

      <h2 className="font-bold text-sm text-stone-500 mb-2">
        カウンセリング（カルテ）履歴（{counseling.length}件）
      </h2>
      {counseling.length === 0 ? (
        <EmptyState message="カウンセリングの記録はまだありません" />
      ) : (
        <div className="space-y-3">
          {counseling.map((r, i) => {
            const flags = riskFlags(r.answers);
            return (
              <Link
                key={r.id}
                href={`/staff/counseling/${r.id}`}
                className="card flex items-center gap-3 active:bg-brand-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">
                    {formatDateTimeJa(r.submittedAt, true)}
                    {i === 0 && (
                      <span className="ml-2 text-[10px] font-bold text-brand-700 border border-brand-300 rounded-full px-1.5 py-0.5">
                        初回
                      </span>
                    )}
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
