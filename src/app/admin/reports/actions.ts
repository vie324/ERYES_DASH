"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

function intField(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`入力値が正しくありません（${name}）`);
  }
  return n;
}

/** 管理者による日報の修正（既存の staffId・日付はそのまま、数値とメモを上書き） */
export async function updateDailyReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const db = getDataStore();

  const report = await db.getDailyReportById(id);
  if (!report) redirect(`/admin/reports${month ? `?month=${month}` : ""}`);

  await db.upsertDailyReport({
    staffId: report!.staffId,
    reportDate: report!.reportDate,
    newClients: intField(formData, "new_clients"),
    repeatClients: intField(formData, "repeat_clients"),
    nextBookings: intField(formData, "next_bookings"),
    serviceSales: intField(formData, "service_sales"),
    optionSales: intField(formData, "option_sales"),
    retailSales: intField(formData, "retail_sales"),
    memo: String(formData.get("memo") ?? "").slice(0, 500),
  });

  revalidatePath("/admin/reports");
  revalidatePath("/staff/stats");
  redirect(`/admin/reports?month=${month || report!.reportDate.slice(0, 7)}&saved=report`);
}

/** 管理者による日報の削除 */
export async function deleteDailyReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!id || formData.get("confirm") !== "on") {
    redirect(`/admin/reports/${id}${month ? `?month=${month}` : ""}`);
  }
  await getDataStore().deleteDailyReport(id);
  revalidatePath("/admin/reports");
  revalidatePath("/staff/stats");
  redirect(`/admin/reports?month=${month}&saved=report_deleted`);
}
