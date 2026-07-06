"use server";

// 出勤スケジュール（管理者）のサーバーアクション集

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(v: unknown): string {
  const s = String(v ?? "").trim();
  return TIME_RE.test(s) ? s : "";
}

/** 週の基本パターンを保存（スタッフ1名分・7曜日まとめて） */
export async function saveWorkPatternAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) redirect("/admin/schedule/patterns?error=input");

  const days = [];
  for (let wd = 0; wd <= 6; wd++) {
    const isWorking = formData.get(`wd_${wd}_working`) === "on";
    days.push({
      weekday: wd,
      isWorking,
      startTime: isWorking ? normalizeTime(formData.get(`wd_${wd}_start`)) : "",
      endTime: isWorking ? normalizeTime(formData.get(`wd_${wd}_end`)) : "",
    });
  }

  await getDataStore().saveWorkPattern(staffId, days);
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/schedule");
  redirect("/admin/schedule/patterns?saved=1");
}

/** 個別調整（1日分の上書き）を保存 */
export async function saveScheduleOverrideAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const staffId = String(formData.get("staff_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const month = date.slice(0, 7);
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect("/admin/schedule?error=input");
  }

  const isWorking = String(formData.get("working") ?? "") === "on_duty";
  await getDataStore().upsertScheduleOverride({
    staffId,
    date,
    isWorking,
    startTime: isWorking ? normalizeTime(formData.get("start_time")) : "",
    endTime: isWorking ? normalizeTime(formData.get("end_time")) : "",
    note: String(formData.get("note") ?? "")
      .trim()
      .slice(0, 100),
  });
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/schedule");
  redirect(`/admin/schedule?month=${month}&saved=override`);
}

/** 個別調整を取り消してパターン・希望休どおりに戻す */
export async function clearScheduleOverrideAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const staffId = String(formData.get("staff_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const month = date.slice(0, 7);
  if (staffId && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await getDataStore().deleteScheduleOverride(staffId, date);
  }
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/schedule");
  redirect(`/admin/schedule?month=${month}&saved=override_cleared`);
}
