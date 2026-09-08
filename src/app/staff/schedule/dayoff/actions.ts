"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { isDayoffEditable } from "@/lib/schedule";
import type { DayoffInput } from "@/lib/data/types";

const MAX_REASON = 100;

/** 希望休の保存（対象月の希望を丸ごと入れ替え。締切後は受け付けない） */
export async function saveDayoffRequestsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const targetMonth = String(formData.get("target_month") ?? "");
  const datesJson = String(formData.get("dates") ?? "[]");

  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    redirect("/staff/schedule/dayoff?error=input");
  }
  if (!isDayoffEditable(targetMonth, todayJst())) {
    redirect(`/staff/schedule/dayoff?month=${targetMonth}&error=deadline`);
  }

  // [{ date, reason, paidLeave }] の配列（旧形式の日付文字列の配列も受ける）
  let dates: DayoffInput[] = [];
  try {
    const parsed = JSON.parse(datesJson);
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      for (const item of parsed) {
        const obj: Record<string, unknown> =
          typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { date: item };
        const date = typeof obj.date === "string" ? obj.date : "";
        if (!date.startsWith(`${targetMonth}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
        seen.add(date);
        dates.push({
          date,
          reason: typeof obj.reason === "string" ? obj.reason.trim().slice(0, MAX_REASON) : "",
          paidLeave: obj.paidLeave === true,
        });
      }
    }
  } catch {
    redirect(`/staff/schedule/dayoff?month=${targetMonth}&error=input`);
  }
  if (dates.length > 31) dates = dates.slice(0, 31);

  await getDataStore().replaceDayoffRequests(session.staffId, targetMonth, dates);
  revalidatePath("/staff/schedule");
  revalidatePath("/admin/schedule");
  redirect(`/staff/schedule/dayoff?month=${targetMonth}&saved=1`);
}
