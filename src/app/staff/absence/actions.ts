"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { todayJst, addDays, formatDateJa } from "@/lib/date";
import type { AbsenceKind } from "@/lib/data/types";
import { notifyQuietly, pushPreview, shortName } from "@/lib/push/notify";

const KIND_LABEL: Record<AbsenceKind, string> = { absence: "欠勤", early_leave: "早退", late: "遅刻" };

/** 欠勤・早退・遅刻の報告を送信 */
export async function createAbsenceReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  // 記録できるのは幹部メンバー以上（画面と同じ条件をサーバー側でも守る）
  if (!(await isExecutive(session))) redirect("/staff");
  const staffId = String(formData.get("staff_id") ?? "") || session.staffId;
  const date = String(formData.get("absence_date") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const kind: AbsenceKind =
    kindRaw === "early_leave" || kindRaw === "late" ? kindRaw : "absence";
  const hours = Number(formData.get("hours") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  // 前後1週間まで（未来の予定欠勤の報告も可）
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date > addDays(todayJst(), 7) ||
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 24 ||
    !reason
  ) {
    redirect("/staff/absence?error=input");
  }

  const db = getDataStore();
  await db.createAbsenceReport({
    staffId,
    absenceDate: date,
    kind,
    hours,
    reason,
    reportedBy: session.staffId,
  });
  // 他の幹部・管理者へ知らせる（報告した本人には送らない）
  const staffList = await db.listStaff();
  const target = staffList.find((s) => s.id === staffId);
  await notifyQuietly(
    db,
    staffList
      .filter((s) => s.isActive && (s.isExecutive || s.role === "admin") && s.id !== session.staffId)
      .map((s) => s.id),
    {
      title: `${KIND_LABEL[kind]}の報告：${shortName(target?.name ?? "スタッフ")}さん`,
      body: `${formatDateJa(date)}（${pushPreview(reason, 50)}）`,
      url: "/staff/absence",
      tag: "absence",
    }
  );
  revalidatePath("/staff/absence");
  redirect("/staff/absence?saved=1");
}

/**
 * 報告の取り消し（管理者アカウントのみ）。
 * 間違えて送った報告や、結局は出勤できたときに一覧から消す。幹部は報告と閲覧まで。
 */
export async function cancelAbsenceReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  // 見ていた月の一覧に戻す
  const list = /^\d{4}-\d{2}$/.test(month) ? `/staff/absence?month=${month}` : "/staff/absence";
  const back = (query: string) => `${list}${list.includes("?") ? "&" : "?"}${query}`;

  if (session.role !== "admin") redirect(back("error=forbidden"));
  if (!id) redirect(list);

  const db = getDataStore();
  const report = await db.getAbsenceReport(id);
  // 二重に押した・別の管理者が先に取り消したときは、消えた状態の一覧を見せるだけ
  if (!report) redirect(back("cancelled=1"));

  await db.deleteAbsenceReport(id);
  // 報告のときに通知した幹部・管理者へ、取り消しも知らせる（古い知らせのまま動かないように）
  const staffList = await db.listStaff();
  const target = staffList.find((s) => s.id === report.staffId);
  await notifyQuietly(
    db,
    staffList
      .filter((s) => s.isActive && (s.isExecutive || s.role === "admin") && s.id !== session.staffId)
      .map((s) => s.id),
    {
      title: `${KIND_LABEL[report.kind]}の取り消し：${shortName(target?.name ?? "スタッフ")}さん`,
      body: `${formatDateJa(report.absenceDate)}の報告は取り消されました`,
      url: "/staff/absence",
      tag: "absence",
    }
  );
  revalidatePath("/staff/absence");
  redirect(back("cancelled=1"));
}
