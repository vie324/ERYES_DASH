"use server";

// イーリスの日報へのコメント・返信の保存。
// 画面で出し分けるだけでなく、ここでもロールと担当店舗（または本人か）を確かめる。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { canPostOnDailyReport, postDailyReportComment, reportThreadHref } from "@/lib/eyes/report-comments";

export async function postReportCommentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const reportId = String(formData.get("report_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const db = getDataStore();
  const report = reportId ? await db.getDailyReportById(reportId) : null;
  if (!report) redirect("/staff");
  const [author, me] = await Promise.all([db.getStaff(report!.staffId), db.getStaff(session.staffId)]);
  if (!author || !me || !canPostOnDailyReport(me, author)) redirect("/staff");
  if (!body) redirect(`${reportThreadHref(report!.id)}?error=empty`);

  await postDailyReportComment(db, { report: report!, author: author!, poster: me!, body });
  revalidatePath(reportThreadHref(report!.id));
  revalidatePath("/staff/daily-reports");
  revalidatePath("/staff/reports");
  redirect(`${reportThreadHref(report!.id)}?posted=1#comments`);
}

/** 自分のコメントだけ消せる */
export async function deleteReportCommentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  if (id) await getDataStore().deleteDailyReportComment(id, session.staffId);
  revalidatePath(reportThreadHref(reportId));
  redirect(`${reportThreadHref(reportId)}#comments`);
}
