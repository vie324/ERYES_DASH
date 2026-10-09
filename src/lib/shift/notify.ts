// 希望休の募集の通知（Web Push）。
// 以前はログに出すだけのモックで、実際には誰にも届かなかった。いまはアプリの通知（Web Push）で、
// まだ出していない人にだけ送る。通知を許可していない人・VAPID鍵が未設定の環境では何も送られないが、
// ホームのお知らせ・メニューの「！」・タスクの「希望休が未提出です」は通知とは別に必ず出る。

import { todayJst } from "@/lib/date";
import { sendPush } from "@/lib/push/notify";
import { currentTargetMonth, deadlineLabel, daysUntilDeadline, remainingLabel } from "@/lib/shift/period";
import { listRequestStatuses } from "@/lib/shift/requests";
import type { DataStore } from "@/lib/data/types";

export interface NoticeResult {
  targetMonth: string;
  /** まだ出していない人の数（通知の対象） */
  unsubmitted: number;
  /** 実際に届いた端末の数 */
  sent: number;
}

/** 募集中の月の希望休をまだ出していない在籍スタッフ（管理者を除く） */
async function unsubmittedStaffIds(db: DataStore, month: string): Promise<string[]> {
  const [staffList, statuses] = await Promise.all([db.listStaff(), listRequestStatuses(db, month)]);
  return staffList
    .filter((s) => s.isActive && s.role !== "admin" && !statuses.get(s.id)?.submitted)
    .map((s) => s.id);
}

/** 募集のお知らせ（毎月15日の定時実行から呼ぶ） */
export async function sendDayoffRequestNotice(db: DataStore, today = todayJst()): Promise<NoticeResult> {
  const rules = await db.getShiftRules();
  const month = currentTargetMonth(rules, today);
  const targets = await unsubmittedStaffIds(db, month);
  const [y, m] = month.split("-").map(Number);
  const { sent } = await sendPush(db, targets, {
    title: `${y}年${m}月分の希望休を出してください`,
    body: `締切は${deadlineLabel(month, rules)}です。休みが要らない月も「休みなしで提出」を押してください。`,
    url: `/staff/schedule/dayoff?month=${month}`,
    tag: `dayoff-${month}`,
  });
  return { targetMonth: month, unsubmitted: targets.length, sent };
}

/** 締切が近い（3日前〜当日）なら、まだ出していない人へのひとこと（毎朝のリマインドに足す） */
export async function dayoffDeadlineReminder(
  db: DataStore,
  today = todayJst()
): Promise<{ staffIds: Set<string>; text: string; url: string } | null> {
  const rules = await db.getShiftRules();
  const month = currentTargetMonth(rules, today);
  const days = daysUntilDeadline(month, rules, today);
  if (days < 0 || days > 3) return null;
  const targets = await unsubmittedStaffIds(db, month);
  if (targets.length === 0) return null;
  return {
    staffIds: new Set(targets),
    text: `${Number(month.slice(5))}月分の希望休の締切が${remainingLabel(month, rules, today)}です`,
    url: `/staff/schedule/dayoff?month=${month}`,
  };
}
