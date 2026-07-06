"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst, weekStartOf } from "@/lib/date";
import { validateEniAnswers, WEEKLY_REPORT_ITEMS } from "@/lib/eni/forms";

/** アシスタント週報の保存（スタッフ×週でユニーク。再保存は上書き） */
export async function saveWeeklyReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const week = String(formData.get("week_start") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || weekStartOf(week) !== week) {
    redirect("/staff/weekly-report?error=input");
  }
  // 未来の週は入力不可（今週まで）
  if (week > weekStartOf(todayJst())) {
    redirect("/staff/weekly-report?error=future");
  }

  const raw: Record<string, unknown> = {};
  for (const item of WEEKLY_REPORT_ITEMS) {
    raw[item.key] = String(formData.get(item.key) ?? "");
  }
  const result = validateEniAnswers(WEEKLY_REPORT_ITEMS, raw);
  if (!result.ok) {
    redirect(`/staff/weekly-report?week=${week}&error=input`);
  }

  await getDataStore().upsertEniReport({
    kind: "weekly",
    staffId: session.staffId,
    periodKey: week,
    answers: result.answers,
  });
  revalidatePath("/staff/weekly-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/weekly-report?week=${week}&saved=1`);
}
