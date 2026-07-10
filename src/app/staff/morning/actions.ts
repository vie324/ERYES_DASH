"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";

function parseRows(raw: string): { t: string; a: string }[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((r) => ({ t: String(r?.t ?? "").slice(0, 5), a: String(r?.a ?? "").trim().slice(0, 100) }))
      .filter((r) => r.t && r.a)
      .slice(0, 40);
  } catch {
    return [];
  }
}

/** 今日のスケジュール（自分の分）を保存：フォーム＋タイムテーブルグリッド＋写真 */
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
      timetable: "",
      timetableRows: parseRows(String(formData.get("timetable_rows") ?? "[]")),
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

/** タイムテーブルのよくある項目を登録（幹部・管理者のみ） */
export async function addSchedulePresetAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const me = await getDataStore().getStaff(session.staffId);
  const canManage = session.role === "admin" || (me?.isExecutive ?? false);
  const label = String(formData.get("label") ?? "").trim().slice(0, 20);
  if (canManage && label) {
    await getDataStore().addSchedulePreset(label);
  }
  revalidatePath("/staff/morning");
  redirect("/staff/morning?preset=1");
}
