"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { isDayoffEditable } from "@/lib/schedule";

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

  let dates: string[] = [];
  try {
    const parsed = JSON.parse(datesJson);
    if (Array.isArray(parsed)) {
      dates = parsed
        .filter((d): d is string => typeof d === "string" && d.startsWith(`${targetMonth}-`))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
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
