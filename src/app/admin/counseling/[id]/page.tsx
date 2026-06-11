import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { CounselingDetail } from "@/components/counseling-detail";
import { PageHeader } from "@/components/ui";
import { adminConfirmCounselingAction } from "../../actions";

// カウンセリング詳細（管理者用）
export default async function AdminCounselingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const db = getDataStore();

  const response = await db.getCounselingResponse(id);
  if (!response) notFound();

  const [customer, confirmedBy] = await Promise.all([
    db.getCustomer(response.customerId),
    response.confirmedBy ? db.getStaff(response.confirmedBy) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader title="カウンセリング内容" backHref="/admin/counseling" backLabel="一覧へ戻る" />
      <CounselingDetail
        response={response}
        customer={customer}
        confirmedByName={confirmedBy?.name}
      />

      {response.status === "pending" && (
        <form action={adminConfirmCounselingAction} className="mt-5">
          <input type="hidden" name="id" value={response.id} />
          <button type="submit" className="btn-primary w-full text-lg">
            内容を確認しました（確認済みにする）
          </button>
        </form>
      )}

      {customer && (
        <p className="mt-4 text-center">
          <Link
            href={`/admin/customers/${customer.id}`}
            className="text-sm font-bold text-brand-700 underline"
          >
            この顧客の詳細・次回予約登録へ
          </Link>
        </p>
      )}
    </div>
  );
}
