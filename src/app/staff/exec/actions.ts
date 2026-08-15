"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";

/** 日報の気づきを「確認済み」にする／戻す（幹部のみ） */
export async function toggleNoticeCheckAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const reportId = String(formData.get("report_id") ?? "");
  const checked = String(formData.get("checked") ?? "") === "1";
  if (!reportId) redirect("/staff/exec?tab=notices&error=input");

  await getDataStore().setExecNoticeChecked(reportId, session.staffId, checked);
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=notices");
}
