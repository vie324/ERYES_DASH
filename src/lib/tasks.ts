// タスク管理（ルーティン／タスク × 自分・依頼・幹部）の共通ロジック。
// 「今日やるべきか」「未完了がいくつあるか」の判定をここに集約し、
// ホームのバッジ・タスク画面・幹部画面・毎朝の通知で同じ数え方になるようにする。

import type {
  DataStore,
  StaffTask,
  TaskCompletion,
  TaskKind,
  TaskRepeat,
  TaskType,
} from "@/lib/data/types";
import { addDays, jstDateOf, weekdayJa, weekdayOf } from "@/lib/date";
import { buildRoutineStatuses, currentPeriodKeys, type RoutineStatus } from "@/lib/eni/routines";

/** 自分で登録したタスク・ルーティンの kind（DBの値は旧名の "routine" のまま。読み違えないよう名前を付けておく） */
export const SELF_TASK_KIND: TaskKind = "routine";

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  routine: "ルーティン",
  task: "タスク",
};

/** 誰が決めたか（画面の小さな印に使う） */
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  routine: "自分",
  request: "依頼",
  exec: "幹部",
};

/**
 * 種類の列が無かった頃のタスクを、どちらに振り分けるか（DBの移行と同じ決まり）。
 * くり返しがある＝ルーティン、それ以外（判断できないものを含む）＝タスク。
 */
export function inferTaskType(repeat: string | null | undefined): TaskType {
  return repeat === "daily" || repeat === "weekly" || repeat === "monthly" ? "routine" : "task";
}

/** DBなどから読んだ値を TaskType にそろえる（空・不正な値はくり返しの有無で決める） */
export function normalizeTaskType(raw: unknown, repeat: TaskRepeat | string | null | undefined): TaskType {
  return raw === "routine" || raw === "task" ? raw : inferTaskType(repeat);
}

/** 繰り返しタスクが「その日やる日」かどうか */
export function isTaskDueOn(task: Pick<StaffTask, "repeat" | "repeatDays">, date: string): boolean {
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
export function repeatLabel(task: Pick<StaffTask, "repeat" | "repeatDays">): string {
  if (!task.repeat) return "";
  if (task.repeat === "daily") return "毎日";
  if (task.repeat === "weekly") {
    const days = [...task.repeatDays].sort((a, b) => a - b).map(weekdayJa).join("・");
    return `毎週 ${days || "？"}`;
  }
  const days = [...task.repeatDays].sort((a, b) => a - b).map((d) => `${d}日`).join("・");
  return `毎月 ${days || "？"}`;
}

/** タスク（1回きり）が期限切れで残っているか */
export function isTaskOverdue(task: StaffTask, today: string): boolean {
  return task.taskType === "task" && task.status !== "done" && Boolean(task.dueDate) && task.dueDate < today;
}

export interface MyTaskSummary {
  /** 自分担当の未完了タスク（ルーティンは常に入る） */
  tasks: StaffTask[];
  /** ルーティンのうち、今日完了済みのタスクID */
  doneTodayIds: Set<string>;
  /** スタイリストの毎日の業務（スタイリストだけ。今の期間のぶん。マスタは幹部メニューで編集） */
  dailyItems: RoutineStatus[];
  /** 「今日対応が必要」な件数（バッジ用） */
  dueCount: number;
}

/**
 * 今日対応が必要か。
 *  ・ルーティン …… 今日やる日で、まだ今日の完了がない
 *  ・タスク ……… 未完了で、期限切れ・今日まで（期限なしの依頼は完了まで出し続ける）
 */
export function isTaskActionable(task: StaffTask, today: string, doneTodayIds: Set<string>): boolean {
  if (task.taskType === "routine") return isTaskDueOn(task, today) && !doneTodayIds.has(task.id);
  if (task.status === "done") return false;
  if (task.dueDate) return task.dueDate <= today;
  return task.kind === "request";
}

/** 自分担当のタスクと「今日やること」の件数をまとめて取る */
export async function getMyTaskSummary(
  db: DataStore,
  staffId: string,
  today: string
): Promise<MyTaskSummary> {
  const [tasks, me] = await Promise.all([db.listStaffTasks({ assigneeStaffId: staffId }), db.getStaff(staffId)]);
  const repeatIds = tasks.filter((t) => t.taskType === "routine").map((t) => t.id);
  const isStylist = me?.jobType === "stylist";
  const [completions, routines, checks] = await Promise.all([
    repeatIds.length > 0
      ? db.listTaskCompletions({ from: today, to: today, taskIds: repeatIds })
      : Promise.resolve([] as TaskCompletion[]),
    isStylist ? db.listManagerRoutines() : Promise.resolve([]),
    isStylist ? db.listManagerRoutineChecks(currentPeriodKeys(today)) : Promise.resolve([]),
  ]);
  const doneTodayIds = new Set(completions.map((c) => c.taskId));
  const dailyItems = isStylist
    ? buildRoutineStatuses(routines, checks, today, { audience: "stylist", subjectKey: staffId })
    : [];
  const dueCount =
    tasks.filter((t) => isTaskActionable(t, today, doneTodayIds)).length +
    dailyItems.filter((s) => !s.done).length;
  return { tasks, doneTodayIds, dailyItems, dueCount };
}

// ---- 達成率・期限切れの集計（ホームの「見える化」で使う）----

export interface RoutineAchievement {
  /** やる日だった回数（ルーティン×日） */
  due: number;
  /** そのうち完了した回数 */
  done: number;
}

/**
 * ルーティン（くり返し）の達成率を、担当者ごとに出す。
 * from〜to の各日について「やる日だったか」「その日の完了があるか」を数える。
 * 完了は task_completions（ルーティン×日）に残っているので、あとから期間を変えても集計できる。
 */
export function routineAchievementByAssignee(
  tasks: StaffTask[],
  completions: TaskCompletion[],
  from: string,
  to: string
): Map<string, RoutineAchievement> {
  const doneKeys = new Set(completions.map((c) => `${c.taskId}|${c.date}`));
  const result = new Map<string, RoutineAchievement>();
  for (const task of tasks) {
    if (task.taskType !== "routine") continue;
    // 作る前の日は数えない（登録した日からが対象）
    const created = jstDateOf(task.createdAt);
    const row = result.get(task.assigneeStaffId) ?? { due: 0, done: 0 };
    for (let d = from > created ? from : created; d <= to; d = addDays(d, 1)) {
      if (!isTaskDueOn(task, d)) continue;
      row.due += 1;
      if (doneKeys.has(`${task.id}|${d}`)) row.done += 1;
    }
    result.set(task.assigneeStaffId, row);
  }
  return result;
}

/** 幹部の「日報の気づき」対象レポートか（2項目のどちらかが書かれている） */
export function hasExecNotice(answers: Record<string, unknown>): boolean {
  const text = (key: string) => (typeof answers[key] === "string" ? (answers[key] as string).trim() : "");
  return text("onsite_notice") !== "" || text("staff_share") !== "";
}
