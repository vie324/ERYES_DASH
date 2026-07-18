"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

const WEEK_SCOPES = ["week1", "week2", "week3", "week4"];

/** 今月の目標を保存 */
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

/** 各週（第1〜4週）の理想スケジュール（タイムテーブル＋画像）を保存 */
export async function saveIdealWeekAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const scope = String(formData.get("scope") ?? "");
  if (!WEEK_SCOPES.includes(scope)) redirect("/staff/ideal?error=1");

  const rowsRaw = String(formData.get("timetable_rows") ?? "[]");
  let content = "[]";
  try {
    const arr = JSON.parse(rowsRaw);
    if (Array.isArray(arr)) {
      content = JSON.stringify(
        arr
          .map((r) => ({ t: String(r?.t ?? "").slice(0, 5), a: String(r?.a ?? "").trim().slice(0, 100) }))
          .filter((r) => r.t && r.a)
          .slice(0, 40)
      );
    }
  } catch {
    content = "[]";
  }

  const photoRaw = String(formData.get("image") ?? "");
  const image = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";

  await getDataStore().upsertIdealSchedule({ staffId: session.staffId, scope, content, image });
  revalidatePath("/staff/ideal");
  redirect(`/staff/ideal?week=${scope}&saved=week`);
}
