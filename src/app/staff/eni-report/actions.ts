"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { computeStylistCalc, STYLIST_REPORT_ITEMS, validateEniAnswers } from "@/lib/eni/forms";

/** 0以上の整数だけ受け取る（空欄は0） */
function minutesField(formData: FormData, name: string): number {
  const n = Math.round(Number(formData.get(name)) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

  // 時間はお客様1人ずつではなく、その日の合計を本人が記入する
  const time = {
    clientCount: minutesField(formData, "client_count"),
    minutesEarly: minutesField(formData, "minutes_early"),
    minutesOver: minutesField(formData, "minutes_over"),
    workMinutes: minutesField(formData, "work_minutes"),
    serviceMinutes: minutesField(formData, "service_minutes"),
  };
  const calc = computeStylistCalc(time);

  await getDataStore().upsertEniReport({
    kind: "stylist",
    staffId: session.staffId,
    periodKey: date,
    answers: {
      ...result.answers,
      client_count: time.clientCount,
      minutes_early: time.minutesEarly,
      minutes_over: time.minutesOver,
      work_minutes: time.workMinutes,
      service_minutes: time.serviceMinutes,
      time_diff: calc.timeDiff,
      // 稼働率は「施術時間の合計」を入れたときだけ記録する
      ...(calc.utilization !== null ? { utilization: calc.utilization } : {}),
    },
  });
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/eni-report?date=${date}&saved=1`);
}
