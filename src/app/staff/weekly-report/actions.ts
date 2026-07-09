"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst, weekStartOf } from "@/lib/date";
import { getWeeklyItems, validateEniAnswers } from "@/lib/eni/forms";

/** アシスタント週報の保存（スタッフ×週でユニーク。再保存は上書き。ランク別の項目） */
export async function saveWeeklyReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const week = String(formData.get("week_start") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || weekStartOf(week) !== week) {
    redirect("/staff/weekly-report?error=input");
  }
  if (week > weekStartOf(todayJst())) {
    redirect("/staff/weekly-report?error=future");
  }

  const me = await getDataStore().getStaff(session.staffId);
  const items = getWeeklyItems(me?.rank ?? "");

  const raw: Record<string, unknown> = {};
  for (const item of items) {
    raw[item.key] = String(formData.get(item.key) ?? "");
  }
  const result = validateEniAnswers(items, raw);
  if (!result.ok) {
    redirect(`/staff/weekly-report?week=${week}&error=input`);
  }

  // どのランクの項目で書いたか記録しておく（閲覧側の表示に使う）
  await getDataStore().upsertEniReport({
    kind: "weekly",
    staffId: session.staffId,
    periodKey: week,
    answers: { ...result.answers, _rank: me?.rank ?? "" },
  });
  revalidatePath("/staff/weekly-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/weekly-report?week=${week}&saved=1`);
}
