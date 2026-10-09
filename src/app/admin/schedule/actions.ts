"use server";

// シフト（管理者）のサーバーアクション集。
//  ・シフト表：自動作成（下書き）／公開／下書きに戻す／下書きの削除
//  ・表のマスの保存（ページを読み込み直さずにその場で反映する。画面が先頭に戻らない）
//  ・基本パターン・ルール設定
// シフト表の操作は、画面で表に出しているスタッフ（店舗の絞り込み。既定は今の業態の店舗）にだけ効く。
// ENi の画面で公開しても、EREYS のシフトが公開・作り直しされることはない（lib/shift/view.ts）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatMonthJa } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
import { buildShiftMonthInputs } from "@/lib/shift/context";
import { loadMonthSchedule } from "@/lib/shift/load";
import { buildMonthSchedule, SHIFT_TYPE_NAME, shortStoreName } from "@/lib/shift/month";
import { currentBrandLabel, resolveShiftView, viewStatus } from "@/lib/shift/view";
import { notifyQuietly } from "@/lib/push/notify";
import type { DataStore, NewShiftAssignment, ShiftType } from "@/lib/data/types";

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

/** 戻り先（同じ月・同じ店舗の絞り込み） */
function backTo(month: string, storeKey: string, extra: string): string {
  const q = new URLSearchParams({ month });
  if (storeKey) q.set("store", storeKey);
  return `/admin/schedule?${q.toString()}&${extra}`;
}

function revalidateShift() {
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/plan");
  revalidatePath("/staff");
}

/** その月の表と、画面で表に出しているスタッフ（店舗の絞り込み）を読み込む */
async function loadView(db: DataStore, month: string, storeParam: string) {
  const loaded = await loadMonthSchedule(db, month, true);
  const view = resolveShiftView({
    stores: loaded.stores,
    activeStaff: loaded.activeStaff,
    schedule: loaded.schedule,
    storeParam,
    brandLabel: await currentBrandLabel(),
  });
  return { loaded, view };
}

// ---------------------------------------------------------------- シフト表

/** 自動作成（下書きを作る。表に出ている人の今の下書きと手直しは消える。公開中なら作り直せない） */
export async function generateShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const storeKey = String(formData.get("store") ?? "");
  const db = getDataStore();
  const { loaded, view } = await loadView(db, month, storeKey);
  if (viewStatus(loaded.assignments, view.memberIds) === "confirmed") {
    redirect(backTo(month, storeKey, "error=confirmed"));
  }

  // 希望休・基本パターン・個別調整・段数・会議の参加者など、組み方に必要な前提をまとめて取る
  // （画面の警告計算と共通）。作るのは表に出ている人の分だけ
  const inputs = await buildShiftMonthInputs(db, month);
  const staffIds = inputs.staffIds.filter((id) => view.memberIds.has(id));
  if (staffIds.length === 0) {
    redirect(backTo(month, storeKey, "error=nostaff"));
  }
  const { assignments } = generateAssignments({ ...inputs, staffIds });
  await db.replaceMonthAssignments(month, assignments, { staffIds: [...view.memberIds] });
  revalidateShift();
  redirect(backTo(month, storeKey, "done=generated"));
}

/** スタッフに公開する（シフトの確定）。表に出ている人の分を公開し、その人たちに通知する */
export async function publishShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const storeKey = String(formData.get("store") ?? "");
  const db = getDataStore();
  const { loaded, view } = await loadView(db, month, storeKey);
  if (viewStatus(loaded.assignments, view.memberIds) === "none") {
    redirect(backTo(month, storeKey, "error=empty"));
  }
  await db.setMonthAssignmentStatus(month, "confirmed", [...view.memberIds]);
  await notifyQuietly(db, [...view.memberIds], {
    title: `${formatMonthJa(month)}のシフトが決まりました`,
    body: "アプリで自分の出勤日を確認してください",
    url: `/staff/schedule?month=${month}`,
    tag: `shift-${month}`,
  });
  revalidateShift();
  redirect(backTo(month, storeKey, "done=published"));
}

/** 公開をやめて下書きに戻す（スタッフにはいつもどおりの予定が出る。自動作成のやり直しもできる） */
export async function unpublishShiftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const storeKey = String(formData.get("store") ?? "");
  const db = getDataStore();
  const { view } = await loadView(db, month, storeKey);
  await db.setMonthAssignmentStatus(month, "draft", [...view.memberIds]);
  revalidateShift();
  redirect(backTo(month, storeKey, "done=unpublished"));
}

/** 下書きのシフト表を削除して、いつもどおりの予定（基本パターン＋希望休）に戻す */
export async function discardDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const month = monthParam(formData);
  const storeKey = String(formData.get("store") ?? "");
  const db = getDataStore();
  const { loaded, view } = await loadView(db, month, storeKey);
  if (viewStatus(loaded.assignments, view.memberIds) === "confirmed") {
    redirect(backTo(month, storeKey, "error=confirmed"));
  }
  await db.replaceMonthAssignments(month, [], { staffIds: [...view.memberIds] });
  revalidateShift();
  redirect(backTo(month, storeKey, "done=discarded"));
}

// ---------------------------------------------------------------- 表のマス

export interface ShiftCellInput {
  month: string;
  /** 画面の店舗の絞り込み（どの人たちのシフト表として保存するかを決める） */
  store: string;
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
 *    シフト表に入っていない人を直したときは、その人のいつもどおりの予定をシフト表に写してから直す
 *  ・シフト表の無い月：個別調整として保存する（すぐスタッフにも反映）
 * 公開中の月を変えたときは、本人に通知を送る。
 */
export async function saveShiftCellAction(input: ShiftCellInput): Promise<ShiftCellResult> {
  await requireAdmin();
  const { month, staffId, date } = input;
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${month}-`)) {
    return { ok: false, message: "日付が正しくありません" };
  }
  const startTime = input.working ? normalizeTime(input.startTime) : "";
  const endTime = input.working ? normalizeTime(input.endTime) : "";
  if (input.working && (input.startTime || input.endTime) && (!startTime || !endTime)) {
    return { ok: false, message: "時間は開始と終了の両方を入れてください（空にすると時間なし）" };
  }
  if (startTime && endTime && startTime >= endTime) {
    return { ok: false, message: "終了は開始より後の時間にしてください" };
  }
  const note = String(input.note ?? "").trim().slice(0, 100);

  try {
    const db = getDataStore();
    const { loaded, view } = await loadView(db, month, String(input.store ?? ""));
    const staff = loaded.staffList.find((s) => s.id === staffId);
    if (!staff) return { ok: false, message: "スタッフが見つかりません" };
    const stores = loaded.stores;
    const status = viewStatus(loaded.assignments, view.memberIds);

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

    // シフト表に入っていない人：まず、いつもどおりの予定（基本パターン＋希望休＋個別調整）をシフト表に写す。
    // 写さずに1日だけ足すと、その人のほかの日がすべて休みになってしまうため
    let myDates = loaded.assignments.filter((a) => a.staffId === staffId).map((a) => a.date);
    /** シフト表に入っていなかった人の、いつもどおりの予定でのこの日の出勤 */
    let usualWorking = false;
    if (myDates.length === 0) {
      const usual = buildMonthSchedule({
        month,
        staff: loaded.activeStaff,
        patterns: loaded.patterns,
        dayoffs: loaded.dayoffs,
        overrides: loaded.overrides,
        assignments: [],
        showDraft: true,
      });
      usualWorking = usual.cell(staffId, date).working;
      const fallbackStore = stores.some((s) => s.id === staff.storeId) ? staff.storeId : (stores[0]?.id ?? "");
      const rows: NewShiftAssignment[] = usual.dates
        .map((d) => usual.cell(staffId, d))
        .filter((c) => c.working && c.date !== date)
        .map((c) => ({
          date: c.date,
          staffId,
          storeId: c.storeId || fallbackStore,
          shiftType: "early",
          startTime: c.startTime,
          endTime: c.endTime,
          note: c.note,
        }));
      if (rows.length > 0) await db.replaceMonthAssignments(month, rows, { staffIds: [staffId], status });
      myDates = rows.map((r) => r.date);
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
      // シフト表は「1日でも出勤がある人」を表に入っている人として扱うので、最後の1日は消さない
      // （消すと、その人はいつもどおりの予定に戻ってしまう）
      if (!myDates.some((d) => d !== date)) {
        // もともと1日も出勤の無い人の休みの日を「休み」で保存した → 何も変わらない
        if (myDates.length === 0 && !usualWorking) return { ok: true, message: "休みのままです（変更はありません）" };
        return {
          ok: false,
          message:
            "この人のこの月の出勤が1日もなくなるため、休みにできません。1ヶ月まるごと休む人は、締切までに希望休を出してもらうか、マスタ設定で「有効」をオフにしてください（オフの間はログインできません）。",
        };
      }
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
  } catch (e) {
    console.error(`[shift] マスの保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, message: "保存できませんでした（通信かデータベースのエラー）。もう一度お試しください。" };
  }
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
