// 当月のLINE Push送信数（無料枠 月500通の管理用）
// 前日の確認（前日リマインド）＋1週間前案内＋予約完了・3日前のお知らせ＋一斉配信の送信通数を合算する。
// 応答メッセージ（reply。「予約確認」への返事など）は通数に含まれない。
// 前日・1週間前は、これまでどおり next_appointments の送信日時で数える（送信の記録と二重に数えない）。

import { jstDayBoundsUtc, monthRange, thisMonthJst } from "@/lib/date";
import type { DataStore } from "@/lib/data/types";

export const LINE_FREE_QUOTA = 500;

export async function getMonthlyPushCount(db: DataStore): Promise<number> {
  const { from, to } = monthRange(thisMonthJst());
  const start = jstDayBoundsUtc(from).start;
  const end = jstDayBoundsUtc(to).end;
  const [reminders, preReminders, notices, broadcasts] = await Promise.all([
    db.countRemindersSent(start, end),
    db.countPreRemindersSent(start, end),
    db.countAppointmentNoticesSent(start, end, ["completion", "three_days"]),
    db.countBroadcastMessages(start, end),
  ]);
  return reminders + preReminders + notices + broadcasts;
}
