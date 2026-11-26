"use server";

// シフトのカレンダー（管理者）の保存。
//  ・日の保存：お店の休み（特別休暇・臨時休業・この日は営業）・行事メモ・スタッフの出勤／休み（理由・続けて何日まで）
//  ・店舗の休みの決まり（定休日の曜日・月の休みの数）
//  ・呼び名（カレンダーに出す名前）をまとめて保存
// 管理者が入れた休みは「個別調整（休み・理由つき）」として残すので、自動で作り直しても休みのまま。
// シフト表のある月（下書き・公開中）は、シフト表のマスもその場で直す。公開中なら本人に通知する。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { logShiftChange } from "@/lib/shift/extras";
import { getDataStore } from "@/lib/data";
import { datesOfMonth, formatDateJa } from "@/lib/date";
import { closureOn } from "@/lib/shift/calendar";
import { loadCalendarContext, type CalendarContext } from "@/lib/shift/calendar-load";
import { currentBrandLabel } from "@/lib/shift/view";
import { notifyQuietly } from "@/lib/push/notify";
import type { DataStore, NewShiftAssignment, StoreCalendarDay } from "@/lib/data/types";

export interface CalendarDayInput {
  month: string;
  /** 画面の店舗の絞り込み（URLの store） */
  store: string;
  /** カレンダーの店舗 */
  storeId: string;
  date: string;
  dayStatus: "" | "closed" | "open";
  closedLabel: string;
  countsAsDayOff: boolean;
  note: string;
  /** 変えたい人だけ（off＝休み。reason＝休みの中身。until＝この日まで続けて同じにする） */
  staff: { staffId: string; off: boolean; reason: string; until: string }[];
}

export type CalendarDayResult = { ok: true; message: string } | { ok: false; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidateShift() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/calendar");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/plan");
  revalidatePath("/staff");
}

/** 公開中のシフトを変えたときの、本人への知らせ（staffId → 変わった日） */
type ChangeLog = Map<string, { date: string; off: boolean }[]>;

/** その人をシフト表に入れる（まだ1日も行が無い人は、いつもどおりの予定をシフト表に写す） */
async function ensureInShift(
  db: DataStore,
  ctx: CalendarContext,
  staffId: string,
  myDates: Map<string, Set<string>>
): Promise<Set<string>> {
  const known = myDates.get(staffId);
  if (known) return known;
  const own = new Set(ctx.inputs.assignments.filter((a) => a.staffId === staffId).map((a) => a.date));
  if (own.size === 0) {
    const rows: NewShiftAssignment[] = datesOfMonth(ctx.month)
      .filter((d) => ctx.dayOf(staffId, d).working)
      .map((d) => ({
        date: d,
        staffId,
        storeId: ctx.store.id,
        shiftType: "early",
        startTime: ctx.patternTime(staffId, d)?.startTime ?? "",
        endTime: ctx.patternTime(staffId, d)?.endTime ?? "",
        note: "",
      }));
    if (rows.length > 0) {
      await db.replaceMonthAssignments(ctx.month, rows, {
        staffIds: [staffId],
        status: ctx.status === "confirmed" ? "confirmed" : "draft",
      });
      for (const r of rows) own.add(r.date);
    }
  }
  myDates.set(staffId, own);
  return own;
}

/**
 * 1人・1日を出勤／休みにする。エラーのときは文を返す。
 *  ・シフト表の無い月：個別調整（休みは理由つき）だけ
 *  ・シフト表のある月：シフト表のマスも直す（最後の1日は休みにできない）
 */
async function setPersonDay(
  db: DataStore,
  ctx: CalendarContext,
  staffId: string,
  date: string,
  off: boolean,
  reason: string,
  myDates: Map<string, Set<string>>,
  changes: ChangeLog
): Promise<string | null> {
  const name = ctx.names.get(staffId) ?? "";
  const override = ctx.inputs.overrides.get(staffId)?.get(date);
  const request = ctx.requestOf(staffId, date);
  const closed = ctx.closures.has(date);
  const now = ctx.dayOf(staffId, date);
  const log = () => changes.set(staffId, [...(changes.get(staffId) ?? []), { date, off }]);

  if (ctx.status === "none") {
    if (off) {
      if (override && !override.isWorking && override.note === reason) return null;
      if (!override && !now.working && reason === "") return null; // もう休み（希望休・基本パターン・お店の休み）
      await db.upsertScheduleOverride({ staffId, date, isWorking: false, startTime: "", endTime: "", note: reason });
    } else {
      if (now.working && !(override && !override.isWorking)) return null;
      if (override) await db.deleteScheduleOverride(staffId, date);
      // 消しても休みのまま（希望休・基本パターンの休み・お店の休み・予定の無い人）なら、出勤の個別調整を入れる
      const stillOff =
        Boolean(request) || ctx.patternOff(staffId, date) || closed || (!ctx.quotaMode && !ctx.inputs.patterns.has(staffId));
      if (stillOff) {
        const t = ctx.patternTime(staffId, date);
        await db.upsertScheduleOverride({
          staffId,
          date,
          isWorking: true,
          startTime: t?.startTime ?? "",
          endTime: t?.endTime ?? "",
          note: "",
        });
      }
    }
    log();
    return null;
  }

  const own = await ensureInShift(db, ctx, staffId, myDates);
  if (off) {
    const wasWorking = own.has(date);
    if (wasWorking) {
      if (own.size <= 1) return `${name}さんは、この月の出勤が1日もなくなるため休みにできません`;
      await db.deleteShiftAssignmentAt(staffId, date);
      own.delete(date);
    }
    // 管理者が決めた休み（理由つき）として残す。作り直しても休みのまま
    const needOverride = wasWorking || reason !== "" || (override && (override.isWorking || override.note !== reason));
    if (needOverride) {
      await db.upsertScheduleOverride({ staffId, date, isWorking: false, startTime: "", endTime: "", note: reason });
    }
    if (wasWorking || needOverride) log();
    return null;
  }

  // 出勤にする
  let changed = false;
  if (override && !override.isWorking) {
    await db.deleteScheduleOverride(staffId, date);
    changed = true;
  }
  if ((request || closed) && !override?.isWorking) {
    // 希望休・お店の休みの日を出勤にした（作り直しても出勤のまま）
    const t = ctx.patternTime(staffId, date);
    await db.upsertScheduleOverride({
      staffId,
      date,
      isWorking: true,
      startTime: t?.startTime ?? "",
      endTime: t?.endTime ?? "",
      note: "",
    });
    changed = true;
  }
  if (!own.has(date)) {
    const t = ctx.patternTime(staffId, date);
    await db.upsertShiftAssignment({
      targetMonth: ctx.month,
      date,
      staffId,
      storeId: ctx.store.id,
      shiftType: "early",
      startTime: t?.startTime ?? "",
      endTime: t?.endTime ?? "",
      note: "",
      status: ctx.status === "confirmed" ? "confirmed" : "draft",
    });
    own.add(date);
    changed = true;
  }
  if (changed) log();
  return null;
}

/** カレンダーの1日を保存する（お店の休み・行事メモ・スタッフの出勤と休み） */
export async function saveCalendarDayAction(input: CalendarDayInput): Promise<CalendarDayResult> {
  const session = await requireAdmin();
  const { month, date } = input;
  if (!/^\d{4}-\d{2}$/.test(month) || !DATE_RE.test(date) || !date.startsWith(`${month}-`)) {
    return { ok: false, message: "日付が正しくありません" };
  }
  const dayStatus = input.dayStatus === "closed" || input.dayStatus === "open" ? input.dayStatus : "";
  const db = getDataStore();
  try {
    const brandLabel = await currentBrandLabel();
    let ctx = await loadCalendarContext(db, month, String(input.store ?? ""), brandLabel);
    if (ctx.store.id !== input.storeId) {
      return { ok: false, message: "店舗が変わりました。画面を読み込み直してから、もう一度お試しください。" };
    }

    // ---- お店の休み・行事メモ ----
    const day: StoreCalendarDay = {
      storeId: ctx.store.id,
      date,
      dayStatus,
      closedLabel: dayStatus === "closed" ? String(input.closedLabel ?? "").trim().slice(0, 20) : "",
      countsAsDayOff: dayStatus === "closed" ? Boolean(input.countsAsDayOff) : false,
      note: String(input.note ?? "").trim().slice(0, 60),
    };
    const before = ctx.storeDays.get(date);
    const dayChanged = before
      ? before.dayStatus !== day.dayStatus ||
        before.closedLabel !== day.closedLabel ||
        before.countsAsDayOff !== day.countsAsDayOff ||
        before.note !== day.note
      : day.dayStatus !== "" || day.note !== "";
    const wasClosed = ctx.closures.has(date);
    const nowClosed = closureOn(ctx.store, day, date) !== null;
    if (dayChanged) {
      await db.saveStoreCalendarDay(day);
      ctx = await loadCalendarContext(db, month, String(input.store ?? ""), brandLabel);
    }

    const myDates = new Map<string, Set<string>>();
    const changes: ChangeLog = new Map();
    const errors: string[] = [];

    // ---- シフト表のある月で、お店の休みにした日・お店を開けた日 ----
    if (ctx.status !== "none" && wasClosed !== nowClosed) {
      for (const p of ctx.people) {
        const override = ctx.inputs.overrides.get(p.id)?.get(date);
        const own = await ensureInShift(db, ctx, p.id, myDates);
        if (nowClosed) {
          // 管理者が出勤にした人（行事で出る人など）はそのまま
          if (!own.has(date) || override?.isWorking || own.size <= 1) continue;
          await db.deleteShiftAssignmentAt(p.id, date);
          own.delete(date);
          changes.set(p.id, [...(changes.get(p.id) ?? []), { date, off: true }]);
        } else if (ctx.quotaMode && !own.has(date) && !override && !ctx.requestOf(p.id, date) && !ctx.patternOff(p.id, date)) {
          const t = ctx.patternTime(p.id, date);
          await db.upsertShiftAssignment({
            targetMonth: month,
            date,
            staffId: p.id,
            storeId: ctx.store.id,
            shiftType: "early",
            startTime: t?.startTime ?? "",
            endTime: t?.endTime ?? "",
            note: "",
            status: ctx.status === "confirmed" ? "confirmed" : "draft",
          });
          own.add(date);
          changes.set(p.id, [...(changes.get(p.id) ?? []), { date, off: false }]);
        }
      }
    }

    // ---- スタッフの出勤・休み（続けて何日まで、も同じにする。お店の休みの日は飛ばす）----
    const peopleIds = new Set(ctx.people.map((p) => p.id));
    for (const row of input.staff ?? []) {
      if (!peopleIds.has(row.staffId)) continue;
      const reason = String(row.reason ?? "").trim().slice(0, 40);
      const until = DATE_RE.test(row.until ?? "") && row.until > date && row.until.startsWith(`${month}-`) ? row.until : date;
      const dates = datesOfMonth(month).filter((d) => d >= date && d <= until && (d === date || !ctx.closures.has(d)));
      for (const d of dates) {
        const err = await setPersonDay(db, ctx, row.staffId, d, Boolean(row.off), reason, myDates, changes);
        if (err) {
          errors.push(err);
          break;
        }
      }
    }

    // 公開中のシフトを変えたら、本人に知らせる（変更の履歴にも残す。依頼12）
    if (ctx.status === "confirmed") {
      for (const [staffId, list] of changes) {
        for (const c of list) {
          await logShiftChange({
            staffId,
            date: c.date,
            before: { working: c.off },
            after: { working: !c.off },
            changedBy: session.staffId,
            note: "カレンダーで変更",
          });
        }
        const text = list
          .slice(0, 3)
          .map((c) => `${formatDateJa(c.date)}は${c.off ? "休み" : "出勤"}`)
          .join("、");
        await notifyQuietly(db, [staffId], {
          title: "シフトが変わりました",
          body: `${text}${list.length > 3 ? `（ほか${list.length - 3}日）` : ""}になりました`,
          url: `/staff/schedule?month=${month}`,
          tag: `shift-change-${month}`,
          kind: "shift",
        });
      }
    }
    revalidateShift();
    if (errors.length > 0) return { ok: false, message: errors.join("\n") };
    const base =
      ctx.status === "confirmed"
        ? "保存しました（公開中なので、変わった人に通知しました）"
        : ctx.status === "draft"
          ? "保存しました（下書き）"
          : "保存しました";
    return { ok: true, message: base };
  } catch (e) {
    console.error(`[shift] カレンダーの保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    const msg = e instanceof Error && /データベースの更新/.test(e.message) ? e.message : "保存できませんでした（通信かデータベースのエラー）。もう一度お試しください。";
    return { ok: false, message: msg };
  }
}

/** 呼び名（カレンダーに出す名前）をまとめて保存 */
export async function saveNicknamesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDataStore();
  const month = String(formData.get("month") ?? "");
  const store = String(formData.get("store") ?? "");
  const staff = await db.listStaff();
  let failed = false;
  for (const s of staff) {
    const raw = formData.get(`nick_${s.id}`);
    if (raw === null) continue;
    const nickname = String(raw).trim().slice(0, 12);
    if (nickname === s.nickname) continue;
    try {
      await db.updateStaff(s.id, { nickname });
    } catch (e) {
      console.error(`[shift] 呼び名の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      failed = true;
    }
  }
  revalidateShift();
  const q = new URLSearchParams();
  if (/^\d{4}-\d{2}$/.test(month)) q.set("month", month);
  if (store) q.set("store", store);
  q.set(failed ? "error" : "done", failed ? "nickname" : "nickname");
  redirect(`/admin/schedule/calendar?${q.toString()}#names`);
}
