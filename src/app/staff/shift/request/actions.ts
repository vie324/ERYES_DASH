"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isRequestEditable } from "@/lib/shift/period";
import type { ShiftPreference } from "@/lib/data/types";

const PREFS: ShiftPreference[] = ["early", "late", "off"];

/** シフト希望の提出（締切までは何度でも上書き可能） */
export async function saveShiftRequestAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const targetMonth = String(formData.get("target_month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) throw new Error("対象月が正しくありません");

  const db = getDataStore();
  const rules = await db.getShiftRules();
  if (!isRequestEditable(targetMonth, rules)) {
    redirect(`/staff/shift/request?month=${targetMonth}&error=deadline`);
  }

  // 日別希望（JSON: { "YYYY-MM-DD": "early" | "late" | "off" }）
  let days: Record<string, ShiftPreference> = {};
  try {
    const raw = JSON.parse(String(formData.get("days_json") ?? "{}")) as Record<string, unknown>;
    for (const [date, pref] of Object.entries(raw)) {
      if (
        date.startsWith(`${targetMonth}-`) &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        PREFS.includes(pref as ShiftPreference)
      ) {
        days[date] = pref as ShiftPreference;
      }
    }
  } catch {
    days = {};
  }

  // 勤務可能店舗（実在する店舗のみ受け付ける）
  const validStoreIds = new Set((await db.listStores()).map((s) => s.id));
  const storeIds = formData
    .getAll("store_ids")
    .map(String)
    .filter((id) => validStoreIds.has(id));

  await db.saveShiftRequest({
    staffId: session.staffId,
    targetMonth,
    note: String(formData.get("note") ?? "").slice(0, 500),
    days,
    storeIds,
  });

  revalidatePath("/staff/shift");
  revalidatePath("/admin/shift");
  redirect(`/staff/shift/request?month=${targetMonth}&saved=1`);
}
