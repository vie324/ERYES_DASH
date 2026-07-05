"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

/** 理想のスケジュール（週・月）を保存 */
export async function saveIdealScheduleAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const week = String(formData.get("week_content") ?? "").trim().slice(0, 2000);
  const month = String(formData.get("month_content") ?? "").trim().slice(0, 2000);

  const db = getDataStore();
  await db.upsertIdealSchedule(session.staffId, "week", week);
  await db.upsertIdealSchedule(session.staffId, "month", month);
  revalidatePath("/staff/ideal");
  revalidatePath("/staff/morning");
  redirect("/staff/ideal?saved=1");
}
