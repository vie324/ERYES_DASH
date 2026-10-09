"use server";

// シフト（管理者）のサーバーアクション集。
//  ・シフト表：自動作成（下書き）／公開／下書きに戻す／下書きの削除
//  ・表のマスの保存（ページを読み込み直さずにその場で反映する。画面が先頭に戻らない）
//  ・基本パターン・ルール設定

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatMonthJa } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
import { buildShiftMonthInputs } from "@/lib/shift/context";
import { SHIFT_TYPE_NAME, shiftStatusOf, shortStoreName } from "@/lib/shift/month";
import { notifyQuietly } from "@/lib/push/notify";
import type { ShiftType } from "@/lib/data/types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(v: unknown): string {
  const s = String(v ?? "").trim();
  return TIME_RE.test(s) ? s : "";
}

function monthParam(formData: FormData): string {
  const month = String(formData.get("target_month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/admin/schedule?error=input");
  return month;
}

function revalidateShift() {
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/plan");
  revalidatePath("/staff");
}

// ---------------------------------------------------------------- シフト表

/** 自動作成（下書きを作る。今の下書きと手直しは消える。公開中の月は作り直せない） */
export async function generateShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const db = getDataStore();

  const existing = await db.listShiftAssignments(month);
  if (shiftStatusOf(existing) === "confirmed") {
    redirect(`/admin/schedule?month=${month}&error=confirmed`);
  }

  // 希望休・基本パターン・個別調整・段数・会議の参加者など、組み方に必要な前提をまとめて取る
  // （画面の警告計算と共通）
  const inputs = await buildShiftMonthInputs(db, month);
  if (inputs.staffIds.length === 0) {
    redirect(`/admin/schedule?month=${month}&error=nostaff`);
  }
  const { assignments } = generateAssignments(inputs);
  await db.replaceMonthAssignments(month, assignments);
  revalidateShift();
  redirect(`/admin/schedule?month=${month}&done=generated`);
}

/** スタッフに公開する（シフトの確定）。公開した月のシフトを全員に通知する */
export async function publishShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const db = getDataStore();
  const existing = await db.listShiftAssignments(month);
  if (existing.length === 0) {
    redirect(`/admin/schedule?month=${month}&error=empty`);
  }
  await db.setMonthAssignmentStatus(month, "confirmed");

  const staffIds = (await db.listStaff()).filter((s) => s.isActive).map((s) => s.id);
  await notifyQuietly(db, staffIds, {
    title: `${formatMonthJa(month)}のシフトが決まりました`,
    body: "アプリで自分の出勤日を確認してください",
    url: `/staff/schedule?month=${month}`,
    tag: `shift-${month}`,
  });
  revalidateShift();
  redirect(`/admin/schedule?month=${month}&done=published`);
}

/** 公開をやめて下書きに戻す（スタッフにはいつもどおりの予定が出る。自動作成のやり直しもできる） */
export async function unpublishShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  await getDataStore().setMonthAssignmentStatus(month, "draft");
  revalidateShift();
  redirect(`/admin/schedule?month=${month}&done=unpublished`);
}

/** 下書きのシフト表を削除して、いつもどおりの予定（基本パターン＋希望休）に戻す */
export async function discardDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const db = getDataStore();
  const existing = await db.listShiftAssignments(month);
  if (shiftStatusOf(existing) === "confirmed") {
    redirect(`/admin/schedule?month=${month}&error=confirmed`);
  }
  await db.replaceMonthAssignments(month, []);
  revalidateShift();
  redirect(`/admin/schedule?month=${month}&done=discarded`);
}

// ---------------------------------------------------------------- 表のマス

export interface ShiftCellInput {
  month: string;
  staffId: string;
  date: string;
  working: boolean;
  storeId: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  note: string;
  /** シフト表の無い月：個別調整を取り消して、いつもどおりに戻す */
  reset?: boolean;
}

export type ShiftCellResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * 表のマスを1つ保存する（リダイレクトしない＝表の位置がそのまま残り、続けて直せる）。
 *  ・シフト表のある月（下書き・公開中）：シフト表のマスを書き換える。休みはマスを消す
 *  ・シフト表の無い月：個別調整として保存する（すぐスタッフにも反映）
 * 公開中の月を変えたときは、本人に通知を送る。
 */
export async function saveShiftCellAction(input: ShiftCellInput): Promise<ShiftCellResult> {
  await requireAdmin();
  const { month, staffId, date } = input;
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${month}-`)) {
    return { ok: false, message: "日付が正しくありません" };
  }
  const db = getDataStore();
  const [staff, stores, existing] = await Promise.all([
    db.getStaff(staffId),
    db.listStores(),
    db.listShiftAssignments(month),
  ]);
  if (!staff) return { ok: false, message: "スタッフが見つかりません" };

  const startTime = input.working ? normalizeTime(input.startTime) : "";
  const endTime = input.working ? normalizeTime(input.endTime) : "";
  if (input.working && (input.startTime || input.endTime) && (!startTime || !endTime)) {
    return { ok: false, message: "時間は開始と終了の両方を入れてください（空にすると時間なし）" };
  }
  if (startTime && endTime && startTime >= endTime) {
    return { ok: false, message: "終了は開始より後の時間にしてください" };
  }
  const note = String(input.note ?? "").trim().slice(0, 100);
  const status = shiftStatusOf(existing);

  if (status === "none") {
    if (input.reset) {
      await db.deleteScheduleOverride(staffId, date);
    } else {
      await db.upsertScheduleOverride({ staffId, date, isWorking: input.working, startTime, endTime, note });
    }
    revalidateShift();
    return {
      ok: true,
      message: input.reset ? "いつもどおりの予定に戻しました" : "保存しました（スタッフにもすぐ反映されます）",
    };
  }

  if (input.working) {
    const store = stores.find((s) => s.id === input.storeId);
    if (!store) return { ok: false, message: "店舗を選んでください" };
    await db.upsertShiftAssignment({
      targetMonth: month,
      date,
      staffId,
      storeId: store.id,
      shiftType: input.shiftType === "late" ? "late" : "early",
      startTime,
      endTime,
      note,
      status,
    });
  } else {
    await db.deleteShiftAssignmentAt(staffId, date);
  }

  // 公開中のシフトを変えたら本人に知らせる（以前は通知が無く、口頭で伝える必要があった）
  if (status === "confirmed") {
    const store = stores.find((s) => s.id === input.storeId);
    const what = input.working
      ? `出勤 ${startTime && endTime ? `${startTime}-${endTime}` : SHIFT_TYPE_NAME[input.shiftType === "late" ? "late" : "early"]}${
          stores.length > 1 && store ? `（${shortStoreName(store.name)}）` : ""
        }`
      : "休み";
    await notifyQuietly(db, [staffId], {
      title: "シフトが変わりました",
      body: `${formatDateJa(date)}は${what}になりました`,
      url: `/staff/schedule?month=${month}`,
      tag: `shift-change-${date}`,
    });
  }
  revalidateShift();
  return {
    ok: true,
    message: status === "confirmed" ? "保存しました（公開中なので本人に通知しました）" : "保存しました（下書き）",
  };
}

// ---------------------------------------------------------------- 基本パターン・ルール

/** 週の基本パターンを保存（スタッフ1名分・7曜日まとめて） */
export async function saveWorkPatternAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) redirect("/admin/schedule/patterns?error=input");

  const days = [];
  for (let wd = 0; wd <= 6; wd++) {
    const isWorking = formData.get(`wd_${wd}_working`) === "on";
    const startTime = isWorking ? normalizeTime(formData.get(`wd_${wd}_start`)) : "";
    const endTime = isWorking ? normalizeTime(formData.get(`wd_${wd}_end`)) : "";
    if (startTime && endTime && startTime >= endTime) {
      redirect(`/admin/schedule/patterns?error=time&staff=${staffId}#staff-${staffId}`);
    }
    days.push({ weekday: wd, isWorking, startTime: startTime && endTime ? startTime : "", endTime: startTime && endTime ? endTime : "" });
  }

  await getDataStore().saveWorkPattern(staffId, days);
  revalidatePath("/admin/schedule/patterns");
  revalidateShift();
  redirect(`/admin/schedule/patterns?saved=${staffId}#staff-${staffId}`);
}

/** ルール設定の更新（連勤上限・最低人数・何ヶ月先・締切日） */
export async function updateShiftRulesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const maxConsecutiveDays = Number(formData.get("max_consecutive_days"));
  const minStaffPerStoreDay = Number(formData.get("min_staff_per_store_per_day"));
  const requestDeadlineDay = Number(formData.get("request_deadline_day"));
  const requestLeadMonths = Number(formData.get("request_lead_months"));

  if (
    !Number.isInteger(maxConsecutiveDays) || maxConsecutiveDays < 1 || maxConsecutiveDays > 30 ||
    !Number.isInteger(minStaffPerStoreDay) || minStaffPerStoreDay < 0 || minStaffPerStoreDay > 20 ||
    !Number.isInteger(requestDeadlineDay) || requestDeadlineDay < 1 || requestDeadlineDay > 28 ||
    !Number.isInteger(requestLeadMonths) || requestLeadMonths < 1 || requestLeadMonths > 12
  ) {
    redirect("/admin/schedule/settings?error=input");
  }

  await getDataStore().updateShiftRules({
    maxConsecutiveDays,
    minStaffPerStoreDay,
    requestDeadlineDay,
    requestLeadMonths,
  });
  revalidatePath("/admin/schedule/settings");
  revalidatePath("/staff/schedule/dayoff");
  revalidatePath("/staff/tasks");
  revalidateShift();
  redirect("/admin/schedule/settings?saved=1");
}
