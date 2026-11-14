"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { recordWeeklyReportView } from "@/lib/views";

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

/**
 * 週報を開いたことを記録する（「みんなの週報」で週報をタップして開いたとき）。
 * 週報を見られる人（アシスタント・スタイリスト・幹部・管理者）の分だけ記録し、自分の週報は数えない。
 * 画面を作り直さない（読んでいる位置が動かない）よう、再検証はしない。
 */
export async function recordReportViewAction(reportId: string): Promise<void> {
  const session = await requireSession();
  if (typeof reportId !== "string" || !reportId) return;
  const db = getDataStore();
  const [me, report] = await Promise.all([db.getStaff(session.staffId), db.getEniReportById(reportId)]);
  if (!me || !report) return;
  const canSeeWeekly =
    session.role === "admin" || me.isExecutive || me.jobType === "stylist" || me.jobType === "assistant";
  if (!canSeeWeekly) return;
  // 週報（kind=weekly）であることを確かめる（日報のIDを渡されても記録しない）
  const weekly = await db.listEniReports("weekly", {
    staffId: report.staffId,
    from: report.periodKey,
    to: report.periodKey,
  });
  if (!weekly.some((r) => r.id === report.id)) return;
  await recordWeeklyReportView(db, session.staffId, report);
}
