"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";

/** 今日のスケジュール（自分の分）を保存：フォーム入力＋スケジュール帳の写真 */
export async function saveDailyPlanAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const photoRaw = String(formData.get("photo") ?? "");
  const photo = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";

  await getDataStore().upsertDailyPlan({
    staffId: session.staffId,
    planDate: todayJst(),
    fields: {
      goal: String(formData.get("goal") ?? "").trim().slice(0, 500),
      horenso: String(formData.get("horenso") ?? "").trim().slice(0, 500),
      todo: String(formData.get("todo") ?? "").trim().slice(0, 1000),
      timetable: String(formData.get("timetable") ?? "").trim().slice(0, 2000),
    },
    photo,
  });
  revalidatePath("/staff/morning");
  redirect("/staff/morning?saved=1");
}

/** ペアの先輩が「見ました」マークをつける */
export async function markPlanSeenAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const staffId = String(formData.get("staff_id") ?? "");
  const planDate = String(formData.get("plan_date") ?? "");
  if (staffId && /^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    await getDataStore().markDailyPlanSeen(staffId, planDate, session.staffId);
  }
  revalidatePath("/staff/morning");
  redirect("/staff/morning?seen=1");
}
