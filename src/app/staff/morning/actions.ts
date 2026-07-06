"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";

/** 今日のスケジュール（自分の分）を保存 */
export async function saveDailyPlanAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const content = String(formData.get("content") ?? "").trim().slice(0, 1000);
  await getDataStore().upsertDailyPlan(session.staffId, todayJst(), content);
  revalidatePath("/staff/morning");
  redirect("/staff/morning?saved=1");
}
