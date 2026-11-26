// 依頼12：シフトに足したもの（勤務パターン・1日ごとの必要人数・締切後の希望休の承認・公開後の変更の履歴）。
// これまでのシフトの仕組み（lib/shift/*）はそのまま使い、足りないところだけをここで持つ。

import { fx } from "@/lib/data/tables";
import type { DayoffLateRequest, ShiftStaffingRule, ShiftTemplate } from "@/lib/data/tables";
import { datesOfMonth, formatDateJa, weekdayOf } from "@/lib/date";
import { notifyStaff } from "@/lib/notify";
import { isRequestEditable } from "@/lib/shift/period";
import type { DataStore, Staff } from "@/lib/data/types";

// ---------------------------------------------------------------- 勤務パターン（時間帯のひな形）

/** まだ1つも登録していないときに出す初期値（営業時間 9:30〜18:30） */
export const DEFAULT_TEMPLATES: Omit<ShiftTemplate, "id" | "createdAt">[] = [
  { name: "通常", startTime: "09:30", endTime: "18:30", breakMinutes: 60, color: "brand", sortOrder: 10, isActive: true },
];

export async function listShiftTemplates(opts: { activeOnly?: boolean } = {}): Promise<ShiftTemplate[]> {
  const rows = await fx().shiftTemplates.list({ order: [["sortOrder", "asc"], ["createdAt", "asc"]] });
  if (rows.length === 0) {
    return DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}`, createdAt: new Date(0) }));
  }
  return opts.activeOnly ? rows.filter((r) => r.isActive) : rows;
}

// ---------------------------------------------------------------- 1日ごとの必要人数

/** 必要人数の表（"日付|店舗" → 人数）。日付の指定 ＞ 曜日の指定 ＞ ルールの「1店舗1日の最低人数」 */
export async function requiredStaffMap(month: string, storeIds: string[], fallback: number): Promise<Map<string, number>> {
  const rules = await fx().shiftStaffingRules.list({ where: { storeId: { in: storeIds } } });
  return requiredStaffFromRules(rules, month, storeIds, fallback);
}

export function requiredStaffFromRules(rules: ShiftStaffingRule[], month: string, storeIds: string[], fallback: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const date of datesOfMonth(month)) {
    const wd = weekdayOf(date);
    for (const storeId of storeIds) {
      const byDate = rules.find((r) => r.storeId === storeId && r.date === date);
      const byWeekday = rules.find((r) => r.storeId === storeId && !r.date && r.weekday === wd);
      map.set(`${date}|${storeId}`, byDate?.required ?? byWeekday?.required ?? fallback);
    }
  }
  return map;
}

// ---------------------------------------------------------------- 締切後の希望休（店長・管理者の承認制）

/** 締切を過ぎた月か（締切前は、ふつうの希望休の画面から出す） */
export async function isPastDeadline(db: DataStore, date: string, today: string): Promise<boolean> {
  return !isRequestEditable(date.slice(0, 7), await db.getShiftRules(), today);
}

/** 承認できる人：その人の店舗の幹部（店長・副店長）・担当店舗の店舗の管理者・管理者 */
export function canApproveFor(approver: Staff, member: Staff): boolean {
  if (approver.role === "admin") return true;
  if (approver.id === member.id) return false;
  if (approver.role === "manager" && approver.managedStoreIds.includes(member.storeId)) return true;
  return approver.isExecutive && approver.storeId === member.storeId;
}

export async function approversOf(db: DataStore, member: Staff): Promise<string[]> {
  const staff = (await db.listStaff()).filter((s) => s.isActive);
  return staff.filter((s) => canApproveFor(s, member)).map((s) => s.id);
}

export async function requestLateDayoff(
  db: DataStore,
  me: Staff,
  input: { date: string; reason: string; paidLeave: boolean }
): Promise<DayoffLateRequest> {
  const row = await fx().dayoffLateRequests.insert({
    staffId: me.id,
    date: input.date,
    reason: input.reason,
    paidLeave: input.paidLeave,
    status: "pending",
  });
  await notifyStaff(db, await approversOf(db, me), {
    kind: "approval",
    title: "締切後の希望休の申請",
    body: `${me.name}さん：${formatDateJa(input.date)}を休みにしたい（${input.reason || "理由なし"}）`,
    href: "/staff/approvals",
    refId: row.id,
  });
  return row;
}

/**
 * 承認・却下する。承認したら、その日を休みにする：
 *  ・シフト表のある月（下書き・公開中）…… その日のシフト表のマスを消す（公開中なら変更の履歴に残し、本人に知らせる）
 *  ・どの月でも …… 個別調整に「休み（締切後の希望休・承認）」を入れる（自動作成をやり直しても休みのまま）
 */
export async function decideLateDayoff(
  db: DataStore,
  approver: Staff,
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: boolean; message: string }> {
  const f = fx();
  const req = await f.dayoffLateRequests.get(id);
  if (!req || req.status !== "pending") return { ok: false, message: "申請が見つからないか、もう決まっています" };
  const member = await db.getStaff(req.staffId);
  if (!member || !canApproveFor(approver, member)) return { ok: false, message: "この申請を決められるのは、その人の店舗の店長・管理者です" };

  if (decision === "approved") {
    const month = req.date.slice(0, 7);
    const assignments = await db.listShiftAssignments(month, member.id);
    const cell = assignments.find((a) => a.date === req.date);
    if (cell) {
      if (assignments.length <= 1) {
        return { ok: false, message: "この月の出勤が1日もなくなるため、シフト表のマスは消せません。シフトの画面で調整してください" };
      }
      await db.deleteShiftAssignmentAt(member.id, req.date);
      if (cell.status === "confirmed") {
        await logShiftChange({
          staffId: member.id,
          date: req.date,
          before: { working: true, start: cell.startTime, end: cell.endTime, storeId: cell.storeId },
          after: { working: false },
          changedBy: approver.id,
          note: "締切後の希望休を承認",
        });
      }
    }
    await db.upsertScheduleOverride({
      staffId: member.id,
      date: req.date,
      isWorking: false,
      startTime: "",
      endTime: "",
      note: req.paidLeave ? "有休（締切後・承認）" : "希望休（締切後・承認）",
    });
  }
  await f.dayoffLateRequests.update(id, { status: decision, decidedBy: approver.id, decidedAt: new Date(), decisionNote: note });
  await notifyStaff(db, [member.id], {
    kind: "shift",
    title: decision === "approved" ? "締切後の希望休が承認されました" : "締切後の希望休は見送りになりました",
    body: `${formatDateJa(req.date)}${note ? `：${note}` : ""}`,
    href: "/staff/schedule/late",
    refId: id,
  });
  return { ok: true, message: decision === "approved" ? "承認しました（その日を休みにしました）" : "見送りにしました" };
}

// ---------------------------------------------------------------- 公開後の変更の履歴

export async function logShiftChange(input: {
  staffId: string;
  date: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedBy: string | null;
  note?: string;
}): Promise<void> {
  try {
    await fx().shiftChangeLogs.insert({
      staffId: input.staffId,
      date: input.date,
      month: input.date.slice(0, 7),
      before: input.before,
      after: input.after,
      changedBy: input.changedBy,
      note: input.note ?? "",
    });
  } catch (e) {
    // 履歴が残せなくても、シフトの変更そのものは止めない（DBの準備前など）
    console.error(`[shift] 変更の履歴の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function describeCell(c: Record<string, unknown>): string {
  if (!c.working) return "休み";
  const time = c.start && c.end ? `${c.start}〜${c.end}` : "出勤";
  return time;
}
