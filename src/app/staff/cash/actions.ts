"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";

function yenField(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? "").trim().replaceAll(",", "");
  if (raw === "") return 0; // 未入力は0扱い
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`金額の入力が正しくありません（${name}）`);
  }
  return n;
}

/** レジ締め（現金管理）の保存。店舗×日付で1件、再保存は上書き */
export async function saveCashReportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const db = getDataStore();

  const storeId = String(formData.get("store_id") ?? "");
  const reportDate = String(formData.get("report_date") ?? todayJst());
  const back = `/staff/cash?date=${reportDate}&store=${storeId}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("日付の形式が正しくありません");
  if (reportDate > todayJst()) redirect(`${back}&error=future`);
  const stores = await db.listStores();
  if (!stores.some((s) => s.id === storeId)) redirect(`/staff/cash?error=store`);

  await db.upsertCashReport({
    storeId,
    reportDate,
    cashSales: yenField(formData, "cash_sales"),
    registerBalance: yenField(formData, "register_balance"),
    movedToSafe: yenField(formData, "moved_to_safe"),
    changeFund: yenField(formData, "change_fund"),
    safeBalance: yenField(formData, "safe_balance"),
    bankDeposit: yenField(formData, "bank_deposit"),
    memo: String(formData.get("memo") ?? "").slice(0, 500),
    createdBy: session.staffId,
  });

  revalidatePath("/staff/cash");
  revalidatePath("/admin/reports");
  redirect(`${back}&saved=1`);
}
