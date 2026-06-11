// 当月のLINE Push送信数（無料枠 月500通の管理用）
// リマインド送信数＋一斉配信の送信通数を合算する。応答メッセージ（reply）は通数に含まれない。

import { jstDayBoundsUtc, monthRange, thisMonthJst } from "@/lib/date";
import type { DataStore } from "@/lib/data/types";

export const LINE_FREE_QUOTA = 500;

export async function getMonthlyPushCount(db: DataStore): Promise<number> {
  const { from, to } = monthRange(thisMonthJst());
  const start = jstDayBoundsUtc(from).start;
  const end = jstDayBoundsUtc(to).end;
  const [reminders, broadcasts] = await Promise.all([
    db.countRemindersSent(start, end),
    db.countBroadcastMessages(start, end),
  ]);
  return reminders + broadcasts;
}
