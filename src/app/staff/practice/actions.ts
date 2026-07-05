"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";

/** 練習記録の追加（自分の分のみ） */
export async function addPracticeRecordAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const date = String(formData.get("practice_date") ?? "");
  const minutes = Number(formData.get("minutes") ?? 0);
  const partnerStaffId = String(formData.get("partner_staff_id") ?? "");
  const partnerName = String(formData.get("partner_name") ?? "").trim().slice(0, 50);
  const content = String(formData.get("content") ?? "").trim().slice(0, 100);
  const month = date.slice(0, 7);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date > todayJst() ||
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > 12 * 60
  ) {
    redirect(`/staff/practice?error=input`);
  }

  await getDataStore().createPracticeRecord({
    staffId: session.staffId,
    practiceDate: date,
    minutes: Math.round(minutes),
    partnerStaffId: partnerStaffId || null,
    partnerName: partnerStaffId ? "" : partnerName,
    content,
  });
  revalidatePath("/staff/practice");
  redirect(`/staff/practice?month=${month}&saved=record`);
}

/** 練習記録の削除（本人・幹部・管理者のみ） */
export async function deletePracticeRecordAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const db = getDataStore();

  const record = await db.getPracticeRecord(id);
  if (!record) redirect(`/staff/practice?month=${month}`);
  const canDelete = record!.staffId === session.staffId || (await isExecutive(session));
  if (!canDelete) redirect(`/staff/practice?month=${month}&error=forbidden`);

  await db.deletePracticeRecord(id);
  revalidatePath("/staff/practice");
  redirect(`/staff/practice?month=${month}&saved=deleted`);
}

/** 練習ペアの設定（幹部・管理者のみ。partner未選択で解除） */
export async function setPracticePairAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff/practice?error=forbidden");

  const targetMonth = String(formData.get("target_month") ?? "");
  const memberStaffId = String(formData.get("member_staff_id") ?? "");
  const partnerStaffId = String(formData.get("partner_staff_id") ?? "");
  if (!/^\d{4}-\d{2}$/.test(targetMonth) || !memberStaffId) {
    redirect("/staff/practice?error=input");
  }

  await getDataStore().setPracticePair(targetMonth, memberStaffId, partnerStaffId);
  revalidatePath("/staff/practice");
  redirect(`/staff/practice?month=${targetMonth}&saved=pair`);
}
