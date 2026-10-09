"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isRequestEditable } from "@/lib/shift/period";
import type { DayoffInput } from "@/lib/data/types";

const MAX_REASON = 100;
const MAX_NOTE = 500;

/**
 * 希望休の提出（対象月の内容を丸ごと入れ替え。締切までは何度でも出し直せる）。
 * 休みたい日・勤務できる店舗・備考をまとめて保存し、休み0日でも「提出済み」を残す。
 */
export async function submitDayoffAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const targetMonth = String(formData.get("target_month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    redirect("/staff/schedule/dayoff?error=input");
  }

  const db = getDataStore();
  const rules = await db.getShiftRules();
  if (!isRequestEditable(targetMonth, rules)) {
    redirect(`/staff/schedule/dayoff?month=${targetMonth}&error=deadline`);
  }

  // [{ date, reason, paidLeave }] の配列（旧形式の日付文字列の配列も受ける）
  const days: DayoffInput[] = [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(String(formData.get("days_json") ?? "[]"));
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) {
    redirect(`/staff/schedule/dayoff?month=${targetMonth}&error=input`);
  }
  const seen = new Set<string>();
  for (const item of parsed as unknown[]) {
    const obj: Record<string, unknown> =
      typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { date: item };
    const date = typeof obj.date === "string" ? obj.date : "";
    if (!date.startsWith(`${targetMonth}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    // 実在する日付だけ（「02-30」などは落とす）
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) continue;
    seen.add(date);
    days.push({
      date,
      reason: typeof obj.reason === "string" ? obj.reason.trim().slice(0, MAX_REASON) : "",
      paidLeave: obj.paidLeave === true,
    });
  }

  // 勤務できる店舗（実在する店舗のみ）。店舗の欄を出していないとき（1店舗のお店・業態の店舗が1つ）は
  // 選ばない＝所属店舗に入る
  const storesShown = formData.get("stores_shown") === "1";
  const validStoreIds = new Set((await db.listStores()).map((s) => s.id));
  const storeIds = storesShown
    ? [...new Set(formData.getAll("store_ids").map(String))].filter((id) => validStoreIds.has(id))
    : [];
  if (storesShown && storeIds.length === 0) {
    redirect(`/staff/schedule/dayoff?month=${targetMonth}&error=store`);
  }

  await db.submitDayoffRequest({
    staffId: session.staffId,
    targetMonth,
    note: String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE),
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
    storeIds,
  });

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/dayoff");
  revalidatePath("/staff");
  revalidatePath("/staff/tasks");
  revalidatePath("/admin/schedule");
  redirect(`/staff/schedule/dayoff?month=${targetMonth}&saved=1`);
}
