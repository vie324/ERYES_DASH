"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

/** 上司（幹部・スタイリスト・管理者）が日報/週報に全体コメントを送る */
export async function commentReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000);
  const back = String(formData.get("back") ?? "/staff/eni-reports");

  const db = getDataStore();
  const me = await db.getStaff(session.staffId);
  const canComment = session.role === "admin" || (me?.isExecutive ?? false) || me?.jobType === "stylist";
  if (!canComment || !id) redirect(back);

  await db.commentEniReport(id, comment, session.staffId);
  revalidatePath("/staff/eni-reports");
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/weekly-report");
  redirect(`${back}&commented=1`);
}
