"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { STYLIST_REPORT_ITEMS, validateEniAnswers } from "@/lib/eni/forms";

/** スタイリスト日報の保存（スタッフ×日付でユニーク。再保存は上書き） */
export async function saveStylistReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const date = String(formData.get("report_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayJst()) {
    redirect("/staff/eni-report?error=date");
  }

  const raw: Record<string, unknown> = {};
  for (const item of STYLIST_REPORT_ITEMS) {
    raw[item.key] = String(formData.get(item.key) ?? "");
  }
  const result = validateEniAnswers(STYLIST_REPORT_ITEMS, raw);
  if (!result.ok) {
    redirect(`/staff/eni-report?date=${date}&error=input`);
  }

  await getDataStore().upsertEniReport({
    kind: "stylist",
    staffId: session.staffId,
    periodKey: date,
    answers: result.answers,
  });
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/eni-report?date=${date}&saved=1`);
}
