// タスク管理（ルーティン／依頼／幹部タスク）の共通ロジック。
// 「今日やるべきか」「未完了がいくつあるか」の判定をここに集約し、
// ホームのバッジ・タスク画面・幹部画面で同じ数え方になるようにする。

import type { DataStore, StaffTask, TaskCompletion, TaskKind } from "@/lib/data/types";
import { weekdayJa, weekdayOf } from "@/lib/date";

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  routine: "ルーティン",
  request: "依頼",
  exec: "幹部",
};

/** 繰り返しタスクが「その日やる日」かどうか */
export function isTaskDueOn(task: StaffTask, date: string): boolean {
  if (!task.repeat) return false;
  if (task.repeat === "daily") return true;
  if (task.repeat === "weekly") return task.repeatDays.includes(weekdayOf(date));
  // monthly：月末が repeatDays の日より短い月は、月末日を締めにする
  const day = Number(date.slice(8));
  const lastDay = Number(
    new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()
  );
  return task.repeatDays.some((d) => d === day || (d > lastDay && day === lastDay));
}

/** 繰り返しの表示（例「毎週 月・木」「毎月 5日」「毎日」） */
export function repeatLabel(task: StaffTask): string {
  if (!task.repeat) return "";
  if (task.repeat === "daily") return "毎日";
  if (task.repeat === "weekly") {
    const days = [...task.repeatDays].sort((a, b) => a - b).map(weekdayJa).join("・");
    return `毎週 ${days || "？"}`;
  }
  const days = [...task.repeatDays].sort((a, b) => a - b).map((d) => `${d}日`).join("・");
  return `毎月 ${days || "？"}`;
}

export interface MyTaskSummary {
  /** 自分担当の未完了タスク（全種類） */
  tasks: StaffTask[];
  /** 繰り返しタスクのうち、今日完了済みのタスクID */
  doneTodayIds: Set<string>;
  /** 「今日対応が必要」な件数（バッジ用） */
  dueCount: number;
}

/** 今日対応が必要か（繰り返し＝今日やる日でまだ／単発＝期限切れ・今日締切・期限なしの依頼） */
export function isTaskActionable(task: StaffTask, today: string, doneTodayIds: Set<string>): boolean {
  if (task.repeat) return isTaskDueOn(task, today) && !doneTodayIds.has(task.id);
  if (task.status === "done") return false;
  if (task.dueDate) return task.dueDate <= today;
  return task.kind === "request"; // 期限なしの依頼は完了まで出し続ける
}

/** 自分担当のタスクと「今日やること」の件数をまとめて取る */
export async function getMyTaskSummary(
  db: DataStore,
  staffId: string,
  today: string
): Promise<MyTaskSummary> {
  const tasks = await db.listStaffTasks({ assigneeStaffId: staffId });
  const repeatIds = tasks.filter((t) => t.repeat).map((t) => t.id);
  const completions: TaskCompletion[] =
    repeatIds.length > 0
      ? await db.listTaskCompletions({ from: today, to: today, taskIds: repeatIds })
      : [];
  const doneTodayIds = new Set(completions.map((c) => c.taskId));
  const dueCount = tasks.filter((t) => isTaskActionable(t, today, doneTodayIds)).length;
  return { tasks, doneTodayIds, dueCount };
}

/** 幹部の「日報の気づき」対象レポートか（2項目のどちらかが書かれている） */
export function hasExecNotice(answers: Record<string, unknown>): boolean {
  const text = (key: string) => (typeof answers[key] === "string" ? (answers[key] as string).trim() : "");
  return text("onsite_notice") !== "" || text("staff_share") !== "";
}
