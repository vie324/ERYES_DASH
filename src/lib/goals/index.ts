// 依頼19：目標・ピラミッド・アクションプラン（マンダラの置き換え）。
//  ・今のピラミッド（下から：大切にしたい価値観 → 理想の未来像 → 目標。assistant_settings）を土台に、
//    「会社 → 店舗 → 個人」の目標をつなげる。会社の目標（5年後の姿・今期のKGI）は管理者が入れる（ENiから届き次第）
//  ・個人は、年と月の目標と、そのためのアクションプランを登録する。マンダラの項目（エリア）は管理画面で変えられる
//  ・アクションプランは依頼1のタスク・ルーティンとして登録し、その進み具合（完了・達成率）が目標に反映される
//  ・週1回の振り返り（できたこと・できなかったこと・来週やること）に、幹部がコメント・スタンプを返す。返したら本人に通知。
//    返していない幹部には知らせる（lib/goals/jobs.ts）

import { fx } from "@/lib/data/tables";
import type { ActionPlan, Goal, GoalFeedback } from "@/lib/data/tables";
import { addDays, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { routineAchievementByAssignee } from "@/lib/tasks";
import type { DataStore, StaffTask } from "@/lib/data/types";

export const GOAL_SETTINGS_KEY = "goal_settings";
export interface GoalSettings {
  /** 個人の目標の分け方（マンダラの8つの項目に当たるもの）。ENiのマンダラの項目が分かったらそろえる（TODO） */
  areas: string[];
  /** 幹部が返すスタンプ */
  stamps: string[];
  /** AIの「やるべきこと」を作る曜日（0=日〜6=土）と、月のはじめに作るか */
  suggestWeekday: number;
  suggestMonthly: boolean;
  /** 振り返りに返していない幹部に知らせる曜日 */
  feedbackReminderWeekday: number;
}
export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  areas: ["技術", "接客", "売上", "集客・SNS", "学び", "チーム", "健康", "生活"],
  stamps: ["👍", "👏", "🔥", "💪", "✨", "🙌"],
  suggestWeekday: 1,
  suggestMonthly: true,
  feedbackReminderWeekday: 3,
};
export async function getGoalSettings(db: DataStore): Promise<GoalSettings> {
  return readJsonSetting(db, GOAL_SETTINGS_KEY, DEFAULT_GOAL_SETTINGS);
}

export const PERIOD_LABEL: Record<Goal["periodType"], string> = {
  vision: "5年後の姿",
  kgi: "今期のKGI",
  year: "今年の目標",
  month: "今月の目標",
};

export interface GoalNode {
  goal: Goal;
  plans: (ActionPlan & { progress: number | null; done: boolean; task: StaffTask | null })[];
  /** アクションプランの進み具合の平均（0〜100。プランが無ければ null） */
  progress: number | null;
  feedback: GoalFeedback[];
}

/** アクションプランの進み具合：タスク＝完了で100、ルーティン＝今月の達成率 */
export async function planProgress(db: DataStore, plans: ActionPlan[]): Promise<Map<string, { progress: number | null; done: boolean; task: StaffTask | null }>> {
  const out = new Map<string, { progress: number | null; done: boolean; task: StaffTask | null }>();
  if (plans.length === 0) return out;
  const tasks = await db.listStaffTasks({ includeDone: true });
  const today = todayJst();
  const { from } = monthRange(today.slice(0, 7));
  const completions = await db.listTaskCompletions({ from, to: today, taskIds: plans.map((p) => p.taskId).filter(Boolean) });
  for (const p of plans) {
    const task = tasks.find((t) => t.id === p.taskId) ?? null;
    if (!task) {
      out.set(p.id, { progress: null, done: false, task: null });
      continue;
    }
    if (task.taskType === "task") {
      out.set(p.id, { progress: task.status === "done" ? 100 : task.status === "in_progress" ? 50 : 0, done: task.status === "done", task });
    } else {
      // ルーティンは、今月のうち「やる日」にどれだけやったか（そのルーティンだけで数える）
      const a = routineAchievementByAssignee([task], completions, from, today).get(task.assigneeStaffId);
      const rate = a && a.due > 0 ? Math.round((a.done / a.due) * 100) : null;
      out.set(p.id, { progress: rate, done: false, task });
    }
  }
  return out;
}

/** その人の目標（個人）と、つながる店舗・会社の目標 */
export async function goalTreeFor(db: DataStore, staffId: string, storeId: string): Promise<{ company: Goal[]; store: Goal[]; personal: GoalNode[] }> {
  const f = fx();
  const [company, store, personal] = await Promise.all([
    f.goals.list({ where: { level: "company", isActive: true }, order: [["periodType", "asc"], ["createdAt", "asc"]] }),
    f.goals.list({ where: { level: "store", storeId, isActive: true }, order: [["createdAt", "asc"]] }),
    f.goals.list({ where: { level: "personal", staffId, isActive: true }, order: [["periodKey", "desc"], ["createdAt", "asc"]] }),
  ]);
  const plans = await f.actionPlans.list({ where: { goalId: { in: personal.map((g) => g.id) } }, order: [["createdAt", "asc"]] });
  const [progress, feedback] = await Promise.all([
    planProgress(db, plans),
    f.goalFeedback.list({ where: { ownerStaffId: staffId, targetType: "goal" }, order: [["createdAt", "asc"]] }),
  ]);
  const nodes: GoalNode[] = personal.map((g) => {
    const mine = plans.filter((p) => p.goalId === g.id).map((p) => ({ ...p, ...(progress.get(p.id) ?? { progress: null, done: false, task: null }) }));
    const nums = mine.map((p) => p.progress).filter((n): n is number => n !== null);
    return { goal: g, plans: mine, progress: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null, feedback: feedback.filter((x) => x.targetId === g.id) };
  });
  return { company, store, personal: nodes };
}

/** 今週（月曜）の振り返りのキー */
export function currentWeekKey(today = todayJst()): string {
  return weekStartOf(today);
}

/** 先週の振り返りで、幹部からまだ何も返っていないもの（店舗ごと） */
export async function reflectionsWithoutFeedback(lastWeekKey: string): Promise<{ id: string; staffId: string }[]> {
  const f = fx();
  const refl = await f.reflections.list({ where: { weekKey: lastWeekKey } });
  if (refl.length === 0) return [];
  const fb = await f.goalFeedback.list({ where: { targetType: "reflection", targetId: { in: refl.map((r) => r.id) } } });
  return refl.filter((r) => !fb.some((x) => x.targetId === r.id)).map((r) => ({ id: r.id, staffId: r.staffId }));
}

export function lastWeekKey(today = todayJst()): string {
  return weekStartOf(addDays(today, -7));
}
