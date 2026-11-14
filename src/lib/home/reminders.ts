// ホームの「4つのリマインド数字」（ENi）。これまでのダッシュボードの4つの数字と同じ決め方：
//  ・今週の週報（アシスタント）…… 今週分の提出人数／アシスタントの人数
//  ・練習時間 …………………………… アシスタントは自分の今週の練習時間、それ以外はアシスタント合計
//  ・議事録の未提出 ……………………… 今月の実施済みミーティングのうち、議事録が出ていない件数
//  ・未完了のタスク ……………………… 議事録から出た未完了のタスク（うち期限切れ）

import { addDays, monthRange, thisMonthJst, weekStartOf } from "@/lib/date";
import { practiceHoursOf } from "@/lib/eni/forms";
import type { DataStore } from "@/lib/data/types";

export type ReminderTone = "good" | "warning" | "critical" | "accent";

export interface ReminderTile {
  key: string;
  label: string;
  value: string;
  unit: string;
  sub: string;
  tone: ReminderTone;
  href: string;
}

export async function eniReminderTiles(
  db: DataStore,
  viewer: { staffId: string; jobType: string },
  today: string
): Promise<ReminderTile[]> {
  const thisWeek = weekStartOf(today);
  const { from, to } = monthRange(thisMonthJst());
  const [staffList, weeklyReports, meetings, openTasks] = await Promise.all([
    db.listStaff(),
    db.listEniReports("weekly", { from: addDays(thisWeek, -35), to: thisWeek }),
    db.listMeetings({ from, to }),
    db.listOpenMeetingTasks(),
  ]);
  const assistants = staffList.filter((s) => s.isActive && s.jobType === "assistant");
  const thisWeekReports = weeklyReports.filter((r) => r.periodKey === thisWeek);
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const seesOwnPractice = viewer.jobType === "assistant";
  const practiceHours = seesOwnPractice
    ? round1(practiceHoursOf(thisWeekReports.find((r) => r.staffId === viewer.staffId)?.answers ?? {}))
    : round1(thisWeekReports.reduce((sum, r) => sum + practiceHoursOf(r.answers), 0));

  const held = meetings.filter((m) => m.meetingDate <= today);
  const missingMinutes = held.filter((m) => !m.minutesDone).length;
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;

  return [
    {
      key: "weekly",
      label: "今週の週報",
      value: `${thisWeekReports.length}/${assistants.length}`,
      unit: "名",
      sub: "アシスタントの提出",
      tone: assistants.length > 0 && thisWeekReports.length >= assistants.length ? "good" : "warning",
      href: seesOwnPractice ? "/staff/weekly-report" : "/staff/eni-reports?tab=weekly",
    },
    {
      key: "practice",
      label: seesOwnPractice ? "今週の自分の練習" : "今週の練習時間",
      value: String(practiceHours),
      unit: "h",
      sub: seesOwnPractice ? "練習・SNS・その他" : "アシスタント合計",
      tone: "accent",
      href: seesOwnPractice ? "/staff/weekly-report" : "/staff/eni-reports?tab=weekly",
    },
    {
      key: "minutes",
      label: "議事録の未提出",
      value: String(missingMinutes),
      unit: "件",
      sub: `今月の実施 ${held.length}件中`,
      tone: missingMinutes > 0 ? "critical" : "good",
      href: "/staff/meetings",
    },
    {
      key: "tasks",
      label: "未完了のタスク",
      value: String(openTasks.length),
      unit: "件",
      sub: overdueTasks > 0 ? `うち期限切れ ${overdueTasks}件` : "議事録のタスク",
      tone: overdueTasks > 0 ? "critical" : openTasks.length > 0 ? "warning" : "good",
      href: "/staff/tasks",
    },
  ];
}
