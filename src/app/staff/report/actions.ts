"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";

function intField(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return 0; // 未入力は0扱い（入力の手間を減らす）
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`入力値が正しくありません（${name}）`);
  }
  return n;
}

export async function saveDailyReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const reportDate = String(formData.get("report_date") ?? todayJst());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error("日付の形式が正しくありません");
  }
  if (reportDate > todayJst()) {
    redirect(`/staff/report?date=${reportDate}&error=future`);
  }

  await getDataStore().upsertDailyReport({
    staffId: session.staffId,
    reportDate,
    newClients: intField(formData, "new_clients"),
    repeatClients: intField(formData, "repeat_clients"),
    nextBookings: intField(formData, "next_bookings"),
    serviceSales: intField(formData, "service_sales"),
    optionSales: intField(formData, "option_sales"),
    retailSales: intField(formData, "retail_sales"),
    memo: String(formData.get("memo") ?? "").slice(0, 500),
    goodPoint: String(formData.get("good_point") ?? "").slice(0, 1000),
    improvement: String(formData.get("improvement") ?? "").slice(0, 1000),
    message: String(formData.get("message") ?? "").slice(0, 1000),
  });

  redirect(`/staff/report?date=${reportDate}&saved=1`);
}
