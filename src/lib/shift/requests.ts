// 希望休の提出状況（スタッフ×月）と、ホーム・メニュー・タスクに出す「希望休を出してください」の判定。
// 以前はホームのお知らせ（旧シフト希望）とメニューの「！」（希望休）が別々のデータを見ていて、
// 片方を出しても、もう片方がずっと出たままになっていた。いまはどちらもここで判定する。
//
// 「提出済み」＝提出の記録がある（休み0日での提出を含む）か、その月の希望休が1日でもある。

import { monthRange, todayJst } from "@/lib/date";
import {
  currentTargetMonth,
  deadlineLabel,
  isNoticePeriod,
  remainingLabel,
  requestDeadline,
} from "@/lib/shift/period";
import type { DataStore } from "@/lib/data/types";

export interface RequestStatus {
  submitted: boolean;
  /** 最後に提出・修正した日時（記録がなければ null） */
  updatedAt: Date | null;
  /** 希望休の日数・うち有休 */
  days: number;
  paidDays: number;
  note: string;
}

/** 1人分の提出状況 */
export async function getMyRequestStatus(db: DataStore, staffId: string, month: string): Promise<RequestStatus> {
  const [record, dayoffs] = await Promise.all([
    db.getShiftRequestMonth(staffId, month),
    db.listDayoffRequests({ staffId, ...monthRange(month) }),
  ]);
  return {
    submitted: Boolean(record) || dayoffs.length > 0,
    updatedAt: record?.updatedAt ?? null,
    days: dayoffs.length,
    paidDays: dayoffs.filter((d) => d.paidLeave).length,
    note: record?.note ?? "",
  };
}

/** 全員分の提出状況（staffId → 状況）。記録も希望休もない人はキーが無い＝未提出 */
export async function listRequestStatuses(db: DataStore, month: string): Promise<Map<string, RequestStatus>> {
  const [records, dayoffs] = await Promise.all([
    db.listShiftRequestMonths(month),
    db.listDayoffRequests(monthRange(month)),
  ]);
  const map = new Map<string, RequestStatus>();
  const ensure = (staffId: string) => {
    if (!map.has(staffId)) {
      map.set(staffId, { submitted: true, updatedAt: null, days: 0, paidDays: 0, note: "" });
    }
    return map.get(staffId)!;
  };
  for (const r of records) {
    const s = ensure(r.staffId);
    s.updatedAt = r.updatedAt;
    s.note = r.note;
  }
  for (const d of dayoffs) {
    const s = ensure(d.staffId);
    s.days++;
    if (d.paidLeave) s.paidDays++;
  }
  return map;
}

export interface DayoffNotice {
  month: string;
  /** 締切日 "YYYY-MM-DD" と表示用 */
  deadline: string;
  deadlineLabel: string;
  /** 「あと◯日」 */
  remaining: string;
  message: string;
  href: string;
}

/**
 * いま「希望休を出してください」と知らせるべきか。
 * 募集中の月の告知期間（締切のある月の前月15日〜締切日）に、まだ提出していなければお知らせを返す。
 */
export async function getDayoffNotice(
  db: DataStore,
  staffId: string,
  today = todayJst()
): Promise<DayoffNotice | null> {
  const rules = await db.getShiftRules();
  const month = currentTargetMonth(rules, today);
  if (!isNoticePeriod(month, rules, today)) return null;
  const status = await getMyRequestStatus(db, staffId, month);
  if (status.submitted) return null;
  const [y, m] = month.split("-").map(Number);
  return {
    month,
    deadline: requestDeadline(month, rules),
    deadlineLabel: deadlineLabel(month, rules),
    remaining: remainingLabel(month, rules, today),
    message: `${y}年${m}月分の希望休を出してください`,
    href: `/staff/schedule/dayoff?month=${month}`,
  };
}
