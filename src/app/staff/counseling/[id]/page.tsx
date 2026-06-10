import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { CounselingDetail } from "@/components/counseling-detail";
import { PageHeader } from "@/components/ui";
import { confirmCounselingAction } from "../actions";

// カウンセリング詳細：iPadで内容を見ながら接客し、最後に「確認済みにする」を押す
export default async function StaffCounselingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
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
      <PageHeader title="カウンセリング内容" backHref="/staff/counseling" backLabel="一覧へ戻る" />
      <CounselingDetail
        response={response}
        customer={customer}
        confirmedByName={confirmedBy?.name}
      />

      {response.status === "pending" && (
        <form action={confirmCounselingAction} className="mt-5">
          <input type="hidden" name="id" value={response.id} />
          <button type="submit" className="btn-primary w-full text-lg">
            内容を確認しました（確認済みにする）
          </button>
        </form>
      )}
    </div>
  );
}
