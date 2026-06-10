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
