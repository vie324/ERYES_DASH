"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { parseBlocks, parseWeekContent, stringifyWeekContent } from "@/lib/eni/schedule-blocks";

const WEEK_SCOPES = ["week1", "week2", "week3", "week4"];

/** 今月の目標を保存（理想のスケジュールの先頭に出る） */
export async function saveMonthGoalAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const content = String(formData.get("content") ?? "").trim().slice(0, 2000);
  await getDataStore().upsertIdealSchedule({
    staffId: session.staffId,
    scope: "month_goal",
    content,
    image: "",
  });
  revalidatePath("/staff/ideal");
  revalidatePath("/staff/morning");
  redirect("/staff/ideal?saved=goal");
}

/** 各週（第1〜4週）の理想スケジュール（1週間の予約表＋画像）を保存 */
export async function saveIdealWeekAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const scope = String(formData.get("scope") ?? "");
  if (!WEEK_SCOPES.includes(scope)) redirect("/staff/ideal?error=1");

  const blocks = parseBlocks(String(formData.get("timetable_blocks") ?? "[]"), 7);
  const photoRaw = String(formData.get("image") ?? "");
  const image = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";

  await getDataStore().upsertIdealSchedule({
    staffId: session.staffId,
    scope,
    content: stringifyWeekContent(blocks),
    image,
  });
  revalidatePath("/staff/ideal");
  redirect(`/staff/ideal?week=${scope}&saved=week`);
}

/** 他の週の内容をこの週にコピーする（毎週ほぼ同じ流れの人向け。画像はコピーしない） */
export async function copyIdealWeekAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const from = String(formData.get("from_scope") ?? "");
  const to = String(formData.get("to_scope") ?? "");
  if (!WEEK_SCOPES.includes(from) || !WEEK_SCOPES.includes(to) || from === to) {
    redirect("/staff/ideal?error=copy");
  }

  const db = getDataStore();
  const ideals = await db.listIdealSchedules(session.staffId);
  const source = ideals.find((s) => s.scope === from);
  const blocks = parseWeekContent(source?.content ?? "");
  if (blocks.length === 0) redirect(`/staff/ideal?week=${to}&error=empty`);

  await db.upsertIdealSchedule({
    staffId: session.staffId,
    scope: to,
    content: stringifyWeekContent(blocks),
    image: ideals.find((s) => s.scope === to)?.image ?? "",
  });
  revalidatePath("/staff/ideal");
  redirect(`/staff/ideal?week=${to}&saved=copied`);
}
