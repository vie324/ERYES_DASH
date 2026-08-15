"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { computeStylistCalc, STYLIST_REPORT_ITEMS, validateEniAnswers } from "@/lib/eni/forms";

/** 0以上の整数だけ受け取る（空欄は0） */
function numberField(formData: FormData, name: string): number {
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

  // 稼働率は必須：入客時間の合計が入っていないと保存できない
  if (String(formData.get("service_minutes") ?? "").trim() === "") {
    redirect(`/staff/eni-report?date=${date}&error=util`);
  }

  const time = {
    clientCount: numberField(formData, "client_count"),
    serviceMinutes: numberField(formData, "service_minutes"),
    nextBookings: numberField(formData, "next_bookings"),
  };
  const calc = computeStylistCalc(time);

  await getDataStore().upsertEniReport({
    kind: "stylist",
    staffId: session.staffId,
    periodKey: date,
    answers: {
      ...result.answers,
      client_count: time.clientCount,
      service_minutes: time.serviceMinutes,
      next_bookings: time.nextBookings,
      // 稼働率＝入客時間÷8時間（自動計算・必須）
      utilization: calc.utilization,
      // 次回予約率も%で記録（閲覧側の表示用）
      ...(calc.rebookRate !== null ? { rebook_rate: calc.rebookRate } : {}),
    },
  });
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/eni-report?date=${date}&saved=1`);
}
