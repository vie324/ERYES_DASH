"use server";

// シフト管理（管理者）のサーバーアクション集

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
import type { ShiftPreference, ShiftType } from "@/lib/data/types";

function monthParam(formData: FormData): string {
  const month = String(formData.get("target_month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("対象月が正しくありません");
  return month;
}

function revalidateShift() {
  revalidatePath("/admin/shift");
  revalidatePath("/admin/shift/board");
  revalidatePath("/staff/shift");
  revalidatePath("/staff/shift/all");
}

/** 自動割当（下書きを生成。既存の割当・手動調整は消える） */
export async function runAutoAssignAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const db = getDataStore();

  // 確定済みの月は再割当しない（公開済みシフトを意図せず壊さないため）
  const existing = await db.listShiftAssignments(month);
  if (existing.some((a) => a.status === "confirmed")) {
    redirect(`/admin/shift/board?month=${month}&error=confirmed`);
  }

  const [stores, staffList, requests, available, rules, prevAssignments] = await Promise.all([
    db.listStores(),
    db.listStaff(),
    db.listShiftRequests(month),
    db.listAvailableStores(month),
    db.getShiftRules(),
    db.listShiftAssignments(addMonths(month, -1)),
  ]);

  const prefs = new Map<string, Map<string, ShiftPreference>>();
  for (const r of requests) {
    if (!prefs.has(r.staffId)) prefs.set(r.staffId, new Map());
    prefs.get(r.staffId)!.set(r.date, r.preference);
  }
  const availableStores = new Map<string, Set<string>>();
  for (const a of available) {
    if (!availableStores.has(a.staffId)) availableStores.set(a.staffId, new Set());
    availableStores.get(a.staffId)!.add(a.storeId);
  }
  const prevMonthAssignedDates = new Map<string, Set<string>>();
  for (const a of prevAssignments) {
    if (!prevMonthAssignedDates.has(a.staffId)) prevMonthAssignedDates.set(a.staffId, new Set());
    prevMonthAssignedDates.get(a.staffId)!.add(a.date);
  }

  const { assignments, warnings } = generateAssignments({
    targetMonth: month,
    storeIds: stores.map((s) => s.id),
    staffIds: staffList.filter((s) => s.isActive).map((s) => s.id),
    prefs,
    availableStores,
    rules,
    prevMonthAssignedDates,
  });

  await db.replaceMonthAssignments(month, assignments);
  revalidateShift();
  redirect(`/admin/shift/board?month=${month}&generated=${assignments.length}&shortage=${warnings.length}`);
}

/** 手動で1件追加（休み希望日や店舗外への割当も可能。ボード上に警告は表示される） */
export async function addAssignmentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const date = String(formData.get("date") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const shiftType = (String(formData.get("shift_type")) === "late" ? "late" : "early") as ShiftType;

  if (!date.startsWith(`${month}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !staffId || !storeId) {
    redirect(`/admin/shift/board?month=${month}&error=input`);
  }

  const db = getDataStore();
  // 確定後に追加した分は、即公開（confirmed）として扱う
  const existing = await db.listShiftAssignments(month);
  const status = existing.some((a) => a.status === "confirmed") ? "confirmed" : "draft";

  try {
    await db.createShiftAssignment({ targetMonth: month, date, staffId, storeId, shiftType, status });
  } catch {
    redirect(`/admin/shift/board?month=${month}&error=duplicate`);
  }
  revalidateShift();
  redirect(`/admin/shift/board?month=${month}&saved=1`);
}

export async function deleteAssignmentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const id = String(formData.get("id") ?? "");
  if (id) await getDataStore().deleteShiftAssignment(id);
  revalidateShift();
  redirect(`/admin/shift/board?month=${month}&deleted=1`);
}

/** シフト確定：全スタッフに公開される */
export async function confirmMonthAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  if (formData.get("confirm") !== "on") {
    redirect(`/admin/shift/board?month=${month}&error=confirm_check`);
  }
  const db = getDataStore();
  const existing = await db.listShiftAssignments(month);
  if (existing.length === 0) {
    redirect(`/admin/shift/board?month=${month}&error=empty`);
  }
  const count = await db.confirmMonthAssignments(month);
  revalidateShift();
  redirect(`/admin/shift/board?month=${month}&confirmed=${count}`);
}

/** ルール設定の更新 */
export async function updateShiftRulesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const maxConsecutiveDays = Number(formData.get("max_consecutive_days"));
  const minStaffPerStoreDay = Number(formData.get("min_staff_per_store_per_day"));
  const requestDeadlineDay = Number(formData.get("request_deadline_day"));

  if (
    !Number.isInteger(maxConsecutiveDays) || maxConsecutiveDays < 1 || maxConsecutiveDays > 30 ||
    !Number.isInteger(minStaffPerStoreDay) || minStaffPerStoreDay < 0 || minStaffPerStoreDay > 20 ||
    !Number.isInteger(requestDeadlineDay) || requestDeadlineDay < 1 || requestDeadlineDay > 28
  ) {
    redirect("/admin/shift/settings?error=input");
  }

  await getDataStore().updateShiftRules({
    maxConsecutiveDays,
    minStaffPerStoreDay,
    requestDeadlineDay,
  });
  revalidatePath("/admin/shift/settings");
  revalidateShift();
  redirect("/admin/shift/settings?saved=1");
}
