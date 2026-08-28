"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { normalizePlanDate } from "@/lib/eni/plan";
import {
  PLAN_WEEK_SCOPES,
  parseBlocks,
  parseWeekContent,
  stringifyWeekContent,
} from "@/lib/eni/schedule-blocks";

const WEEK_SCOPES: string[] = [...PLAN_WEEK_SCOPES];

/** その日のスケジュールを保存（フォーム＋予約表＋写真） */
export async function saveDayPlanAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const today = todayJst();
  const date = normalizePlanDate(String(formData.get("plan_date") ?? ""), today);
  const photoRaw = String(formData.get("photo") ?? "");
  const photo = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";

  await getDataStore().upsertDailyPlan({
    staffId: session.staffId,
    planDate: date,
    fields: {
      goal: String(formData.get("goal") ?? "").trim().slice(0, 500),
      horenso: String(formData.get("horenso") ?? "").trim().slice(0, 500),
      todo: String(formData.get("todo") ?? "").trim().slice(0, 1000),
      timetable: "",
      timetableBlocks: parseBlocks(String(formData.get("timetable_blocks") ?? "[]"), 1),
    },
    photo,
  });
  revalidatePath("/staff/plan");
  redirect(`/staff/plan?date=${date}&saved=day`);
}

/** ペアの先輩が「見ました」マークをつける */
export async function markPlanSeenAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const staffId = String(formData.get("staff_id") ?? "");
  const planDate = String(formData.get("plan_date") ?? "");
  if (staffId && /^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    await getDataStore().markDailyPlanSeen(staffId, planDate, session.staffId);
  }
  revalidatePath("/staff/plan");
  redirect(`/staff/plan?date=${planDate}&tab=team&saved=seen`);
}

/** 今月の目標を保存（計画スケジュールの先頭に出る） */
export async function saveMonthGoalAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const content = String(formData.get("content") ?? "").trim().slice(0, 2000);
  await getDataStore().upsertIdealSchedule({
    staffId: session.staffId,
    scope: "month_goal",
    content,
    image: "",
  });
  revalidatePath("/staff/plan");
  redirect("/staff/plan?tab=plan&saved=goal");
}

/** 計画スケジュール（第1〜4週の1週間ぶん＋画像）を保存 */
export async function savePlanWeekAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const scope = String(formData.get("scope") ?? "");
  if (!WEEK_SCOPES.includes(scope)) redirect("/staff/plan?tab=plan&error=input");

  const blocks = parseBlocks(String(formData.get("timetable_blocks") ?? "[]"), 7);
  const photoRaw = String(formData.get("image") ?? "");
  const image = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";

  await getDataStore().upsertIdealSchedule({
    staffId: session.staffId,
    scope,
    content: stringifyWeekContent(blocks),
    image,
  });
  revalidatePath("/staff/plan");
  redirect(`/staff/plan?tab=plan&week=${scope}&saved=week`);
}

/** 他の週の内容をこの週にコピー（毎週ほぼ同じ流れの人向け。画像はコピーしない） */
export async function copyPlanWeekAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const from = String(formData.get("from_scope") ?? "");
  const to = String(formData.get("to_scope") ?? "");
  if (!WEEK_SCOPES.includes(from) || !WEEK_SCOPES.includes(to) || from === to) {
    redirect("/staff/plan?tab=plan&error=copy");
  }

  const db = getDataStore();
  const ideals = await db.listIdealSchedules(session.staffId);
  const blocks = parseWeekContent(ideals.find((s) => s.scope === from)?.content ?? "");
  if (blocks.length === 0) redirect(`/staff/plan?tab=plan&week=${to}&error=empty`);

  await db.upsertIdealSchedule({
    staffId: session.staffId,
    scope: to,
    content: stringifyWeekContent(blocks),
    image: ideals.find((s) => s.scope === to)?.image ?? "",
  });
  revalidatePath("/staff/plan");
  redirect(`/staff/plan?tab=plan&week=${to}&saved=copied`);
}

/** タイムテーブルのよくある項目を登録（全員。みんなで使う候補リストを育てる） */
export async function addSchedulePresetAction(formData: FormData): Promise<void> {
  await requireSession();
  const label = String(formData.get("label") ?? "").trim().slice(0, 20);
  const back = String(formData.get("back") ?? "/staff/plan");
  if (label) await getDataStore().addSchedulePreset(label);
  revalidatePath("/staff/plan");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=preset`);
}

/** よくある項目の削除（幹部・管理者のみ。候補が増えすぎたときの整理用） */
export async function deleteSchedulePresetAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const me = await getDataStore().getStaff(session.staffId);
  const canManage = session.role === "admin" || (me?.isExecutive ?? false);
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/staff/plan");
  if (canManage && id) await getDataStore().deleteSchedulePreset(id);
  revalidatePath("/staff/plan");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=preset`);
}
