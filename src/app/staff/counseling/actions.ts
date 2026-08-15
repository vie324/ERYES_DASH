"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

/** カウンセリングを「確認済み」にする（接客時にiPadで内容確認後に押す） */
export async function confirmCounselingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("IDが指定されていません");

  await getDataStore().confirmCounselingResponse(id, session.staffId);
  revalidatePath("/staff/counseling");
  revalidatePath("/admin/counseling");
  redirect("/staff/counseling?confirmed=1");
}

/** リダイレクト先（スタッフ／管理者のカウンセリング画面のみ許可） */
function inviteBackOf(formData: FormData): string {
  const back = String(formData.get("back") ?? "");
  return back === "/admin/counseling" ? back : "/staff/counseling";
}

/** 来店前カウンセリングの案内URLを発行する（SMSで送るためのURL） */
export async function createCounselingInviteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = inviteBackOf(formData);
  const customerName = String(formData.get("customer_name") ?? "").trim().slice(0, 50);
  // 電話番号：数字・+・-・スペースのみ受け付け、保存は数字と+だけに揃える
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw.replace(/[-\s()]/g, "");

  if (!customerName || !/^\+?\d{10,13}$/.test(phone)) {
    redirect(`${back}?invite_error=input`);
  }

  const invite = await getDataStore().createCounselingInvite({
    customerName,
    phone,
    createdBy: session.staffId,
  });
  revalidatePath("/staff/counseling");
  revalidatePath("/admin/counseling");
  redirect(`${back}?invite=${invite.id}#invite-panel`);
}

/** 未回答の案内を削除する（間違えて発行したとき用） */
export async function deleteCounselingInviteAction(formData: FormData): Promise<void> {
  await requireSession();
  const back = inviteBackOf(formData);
  const id = String(formData.get("id") ?? "");
  const db = getDataStore();
  const invite = (await db.listCounselingInvites(100)).find((i) => i.id === id);
  // 回答済みの案内は履歴として残す（削除できるのは未回答のみ）
  if (invite && !invite.answeredAt) await db.deleteCounselingInvite(id);
  revalidatePath("/staff/counseling");
  revalidatePath("/admin/counseling");
  redirect(`${back}#invite-panel`);
}
