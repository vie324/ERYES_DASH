// ホームのショートカット・サイドバーに出す小さな数字（未読・未完了・未提出）。
// どこで数えても同じになるよう、ここに集める。

import { BRAND_INFO, type Brand } from "@/lib/brand";
import { addDays, weekStartOf } from "@/lib/date";
import { brandStoreIds } from "@/lib/shift/month";
import { getDayoffNotice } from "@/lib/shift/requests";
import { hasExecNotice, isTaskOverdue } from "@/lib/tasks";
import { buildRoutineStatuses, countUndone, currentPeriodKeys, defaultRoutineStoreId } from "@/lib/eni/routines";
import type { DataStore, Staff } from "@/lib/data/types";
import type { ShortcutBadgeKey } from "@/lib/home/shortcuts";

/**
 * 幹部メニューの数字：未確認の「日報の気づき」＋期限切れの幹部タスク＋自分の店舗の今のルーティンの未完了。
 * サイドバー（app-frame）とホームのショートカットで同じ数え方にする。
 */
export async function countExecAttention(db: DataStore, me: Staff | null, brand: Brand, today: string): Promise<number> {
  const noticeReports = (await db.listEniReports("stylist", { from: addDays(today, -30), to: today })).filter((r) =>
    hasExecNotice(r.answers)
  );
  const [checks, execTasks, routines, routineChecks, stores] = await Promise.all([
    db.listExecNoticeChecks(noticeReports.map((r) => r.id)),
    db.listStaffTasks({ kind: "exec" }),
    db.listManagerRoutines(),
    db.listManagerRoutineChecks(currentPeriodKeys(today)),
    db.listStores(),
  ]);
  const checkedIds = new Set(checks.map((c) => c.reportId));
  const uncheckedNotices = noticeReports.filter((r) => !checkedIds.has(r.id)).length;
  const overdueExecTasks = execTasks.filter((t) => isTaskOverdue(t, today)).length;
  // 記録は店舗ごとなので、幹部メニューで最初に開く店舗（自分の店舗）の分を数える
  const brandIds = new Set(brandStoreIds(stores, BRAND_INFO[brand].label));
  const routineStoreId = defaultRoutineStoreId(me, stores.filter((st) => brandIds.has(st.id)));
  const undoneRoutines = countUndone(
    buildRoutineStatuses(routines, routineChecks, today, { audience: "exec", subjectKey: routineStoreId })
  );
  return uncheckedNotices + overdueExecTasks + undoneRoutines;
}

/** ショートカットの小さな数字（数字＝件数、"！"＝まだ出していない） */
export async function shortcutBadges(
  db: DataStore,
  input: {
    me: Staff | null;
    isAdmin: boolean;
    isExec: boolean;
    brand: Brand;
    today: string;
    /** 今日対応が必要なタスクの数（getMyTaskSummary の dueCount） */
    taskDue: number;
    /** 未読のトーク */
    chatUnread: number;
  }
): Promise<Partial<Record<ShortcutBadgeKey, number | string | null>>> {
  const { me, today } = input;
  const staffId = me?.id ?? "";
  const jobType = me?.jobType ?? "";
  const [missingMinutes, myPlan, stylistReport, weeklyReport, dayoff, exec] = await Promise.all([
    db.listMeetingsMissingMinutes(today),
    input.isAdmin
      ? Promise.resolve(undefined)
      : db.listDailyPlans(today).then((p) => p.find((x) => x.staffId === staffId) ?? null),
    !input.isAdmin && jobType !== "assistant" ? db.getEniReport("stylist", staffId, today) : Promise.resolve(undefined),
    !input.isAdmin && jobType !== "stylist" ? db.getEniReport("weekly", staffId, weekStartOf(today)) : Promise.resolve(undefined),
    input.isAdmin ? Promise.resolve(null) : getDayoffNotice(db, staffId, today),
    input.isExec ? countExecAttention(db, me, input.brand, today) : Promise.resolve(0),
  ]);
  const mine = missingMinutes.filter((m) => m.hostStaffId === staffId || m.createdBy === staffId).length;
  return {
    tasks: input.taskDue || null,
    chat: input.chatUnread || null,
    eniReport: stylistReport === null ? "！" : null,
    weeklyReport: weeklyReport === null ? "！" : null,
    plan: myPlan === null ? "！" : null,
    meetings: (input.isAdmin ? missingMinutes.length : mine) || null,
    schedule: dayoff ? "！" : null,
    exec: exec || null,
  };
}
