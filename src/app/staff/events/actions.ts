"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 保存・削除のあとに戻るページ（全体スケジュールは「予定」の全体タブと会社の予定ページの両方から操作する）。
 * アプリ内のページだけ受け付ける（改ざん対策）。
 */
function backOf(formData: FormData): string {
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/staff/plan") || back.startsWith("/staff/events")) return back;
  const month = String(formData.get("month") ?? "");
  return /^\d{4}-\d{2}$/.test(month) ? `/staff/events?month=${month}` : "/staff/events";
}

/** 戻り先のURLにクエリを足す */
function withParam(url: string, param: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${param}`;
}

/** 会社の予定の登録・編集（幹部・管理者のみ） */
export async function saveCompanyEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  if (!(await isExecutive(session))) redirect(withParam(back, "error=forbidden"));

  const id = String(formData.get("id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const required = formData.get("required") === "on";

  // 終了日は未入力なら開始日と同じ（1日のイベント）
  const endDate = endDateRaw || startDate;
  const ok =
    DATE.test(startDate) &&
    DATE.test(endDate) &&
    endDate >= startDate &&
    (startTime === "" || TIME.test(startTime)) &&
    title !== "";
  if (!ok) redirect(withParam(back, "error=input"));

  await getDataStore().upsertCompanyEvent({
    ...(id ? { id } : {}),
    startDate,
    endDate,
    startTime,
    title,
    body,
    required,
    createdBy: session.staffId,
  });
  revalidatePath("/staff/events");
  revalidatePath("/staff/plan");
  revalidatePath("/staff");
  redirect(withParam(back, "saved=event"));
}

/** 会社の予定の削除（幹部・管理者のみ） */
export async function deleteCompanyEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  if (!(await isExecutive(session))) redirect(withParam(back, "error=forbidden"));

  const id = String(formData.get("id") ?? "");
  if (!id) redirect(back);

  await getDataStore().deleteCompanyEvent(id);
  revalidatePath("/staff/events");
  revalidatePath("/staff/plan");
  revalidatePath("/staff");
  redirect(withParam(back, "saved=event-deleted"));
}
