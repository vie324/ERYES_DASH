"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import {
  computeStylistCalc,
  STYLIST_REPORT_ITEMS,
  validateEniAnswers,
  type ClientEntry,
} from "@/lib/eni/forms";

function parseClients(raw: string): ClientEntry[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({ booked: Math.max(0, Math.round(Number(c?.booked) || 0)), actual: Math.max(0, Math.round(Number(c?.actual) || 0)) }))
      .filter((c) => c.booked > 0 || c.actual > 0)
      .slice(0, 40);
  } catch {
    return [];
  }
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

  const clients = parseClients(String(formData.get("clients_json") ?? "[]"));
  const workMinutes = Math.max(0, Math.round(Number(formData.get("work_minutes")) || 0));
  const calc = computeStylistCalc(clients, workMinutes);

  await getDataStore().upsertEniReport({
    kind: "stylist",
    staffId: session.staffId,
    periodKey: date,
    answers: {
      ...result.answers,
      clients,
      work_minutes: workMinutes,
      client_count: calc.clientCount,
      utilization: calc.utilization,
      time_diff: calc.timeDiff,
    },
  });
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff/eni-reports");
  redirect(`/staff/eni-report?date=${date}&saved=1`);
}
