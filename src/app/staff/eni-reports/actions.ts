"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

function revalidateReports(): void {
  revalidatePath("/staff/eni-reports");
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/weekly-report");
}

/**
 * 上司・先輩（幹部・スタイリスト・管理者）が日報/週報にコメントを追加する。
 * 以前は1枠を上書きする形だったため、別の人が書くと前のコメントが消えていた。
 * いまは1件ずつ足していくので、スタイリスト同士が重ねてコメントできる。
 */
export async function commentReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("comment") ?? "").trim().slice(0, 1000);
  const back = String(formData.get("back") ?? "/staff/eni-reports");

  const db = getDataStore();
  const me = await db.getStaff(session.staffId);
  const canComment = session.role === "admin" || (me?.isExecutive ?? false) || me?.jobType === "stylist";
  if (!canComment || !id || !body) redirect(back);

  await db.addEniReportComment(id, session.staffId, body);
  revalidateReports();
  redirect(`${back}&commented=1`);
}

/** 自分が書いたコメントを消す（他人のコメントはストア側で弾かれる） */
export async function deleteReportCommentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const commentId = String(formData.get("comment_id") ?? "");
  const back = String(formData.get("back") ?? "/staff/eni-reports");
  if (!commentId) redirect(back);

  await getDataStore().deleteEniReportComment(commentId, session.staffId);
  revalidateReports();
  redirect(`${back}&commented=deleted`);
}
