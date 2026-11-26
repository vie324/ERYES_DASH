"use server";

// 依頼19：目標・アクションプラン・振り返り・フィードバック・AIの提案の採用

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import type { Goal } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { InputError, attempt, bool, int, num, resultUrl, str } from "@/lib/action-utils";
import { notifyStaff } from "@/lib/notify";
import { shortName } from "@/lib/push/notify";
import { currentWeekKey, getGoalSettings, GOAL_SETTINGS_KEY } from "@/lib/goals";
import { decideSuggestion, getOrCreateSuggestion } from "@/lib/goals/suggest";
import { linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { todayJst } from "@/lib/date";

function backOf(fd: FormData): string {
  const b = str(fd, "back", 200);
  return /^\/(staff\/goals|admin\/goals)/.test(b) ? b : "/staff/goals";
}

export async function saveGoalAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const back = backOf(fd);
  const r = await attempt(async () => {
    const level = (["company", "store", "personal"] as const).find((l) => l === str(fd, "level", 10)) ?? "personal";
    if (level !== "personal" && !v.isAdmin) throw new InputError("会社・店舗の目標は管理者が入れます");
    const periodType = (["vision", "kgi", "year", "month"] as const).find((p) => p === str(fd, "period_type", 10)) ?? "month";
    const title = str(fd, "title", 120);
    if (!title) throw new InputError("目標を入れてください");
    const id = str(fd, "id", 80);
    const row: Partial<Goal> = {
      level,
      storeId: level === "store" ? str(fd, "store", 80) || null : level === "personal" ? (v.me?.storeId ?? null) : null,
      staffId: level === "personal" ? v.staffId : null,
      periodType,
      periodKey: str(fd, "period_key", 10) || (periodType === "month" ? todayJst().slice(0, 7) : todayJst().slice(0, 4)),
      title,
      body: str(fd, "body", 1000),
      metric: str(fd, "metric", 30),
      targetValue: num(fd, "target", 0),
      unit: str(fd, "unit", 10),
      parentId: str(fd, "parent", 80) || null,
      area: str(fd, "area", 30),
      updatedAt: new Date(),
    };
    const f = fx();
    if (id) {
      const g = await f.goals.get(id);
      if (!g) throw new InputError("目標が見つかりません");
      if (g.level === "personal" ? g.staffId !== v.staffId : !v.isAdmin) throw new InputError("自分の目標だけ直せます");
      await f.goals.update(id, row);
    } else {
      await f.goals.insert({ ...row, isActive: true, createdBy: v.staffId });
    }
  });
  revalidatePath("/staff/goals");
  redirect(resultUrl(back, r));
}

export async function archiveGoalAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const back = backOf(fd);
  const r = await attempt(async () => {
    const g = await fx().goals.get(str(fd, "id", 80));
    if (!g) throw new InputError("目標が見つかりません");
    if (g.level === "personal" ? g.staffId !== v.staffId : !v.isAdmin) throw new InputError("自分の目標だけ外せます");
    await fx().goals.update(g.id, { isActive: false, updatedAt: new Date() });
  }, "目標を外しました");
  redirect(resultUrl(back, r));
}

/** アクションプランを足す：タスク（1回）かルーティン（くり返し）として登録する */
export async function addPlanAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    const goal = await fx().goals.get(str(fd, "goal", 80));
    if (!goal || goal.staffId !== v.staffId) throw new InputError("自分の目標を選んでください");
    const title = str(fd, "title", 80);
    if (!title) throw new InputError("アクションプランを入れてください");
    const kind = str(fd, "kind", 10) === "routine" ? "routine" : "task";
    const repeat = kind === "routine" ? (str(fd, "repeat", 10) === "weekly" ? "weekly" : "daily") : "";
    const weekday = int(fd, "weekday", 1);
    const task = await getDataStore().createStaffTask({
      taskType: kind,
      kind: "routine",
      title,
      note: `目標「${goal.title}」のアクションプラン`,
      assigneeStaffId: v.staffId,
      createdBy: v.staffId,
      dueDate: kind === "task" ? str(fd, "due", 10) : "",
      repeat,
      repeatDays: repeat === "weekly" ? [weekday] : [],
      status: "open",
    });
    await fx().actionPlans.insert({ goalId: goal.id, staffId: v.staffId, title, taskId: task.id, kind, createdBy: v.staffId });
    return kind === "routine" ? "ルーティンとして登録しました（今日やることに出ます）" : "タスクとして登録しました";
  });
  revalidatePath("/staff/goals");
  redirect(resultUrl("/staff/goals", r));
}

export async function saveReflectionAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    const weekKey = currentWeekKey();
    const row = { done: str(fd, "done", 1000), notDone: str(fd, "not_done", 1000), next: str(fd, "next", 1000), updatedAt: new Date() };
    if (!row.done && !row.notDone && !row.next) throw new InputError("どれか1つは書いてください");
    const f = fx();
    const existing = await f.reflections.find({ staffId: v.staffId, weekKey });
    if (existing) await f.reflections.update(existing.id, row);
    else await f.reflections.insert({ staffId: v.staffId, weekKey, ...row });
  }, "振り返りを保存しました。幹部からの返事は通知で届きます");
  revalidatePath("/staff/goals");
  redirect(resultUrl("/staff/goals#reflection", r));
}

/** 幹部のフィードバック（目標・アクションプラン・振り返りへ）。本人に通知する */
export async function addFeedbackAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const back = backOf(fd);
  const r = await attempt(async () => {
    if (!v.isExec && !v.isStoreManager) throw new InputError("フィードバックを返せるのは幹部・管理者です");
    const targetType = (["goal", "plan", "reflection"] as const).find((t) => t === str(fd, "type", 12));
    const targetId = str(fd, "target", 80);
    if (!targetType || !targetId) throw new InputError("返す先が正しくありません");
    const owner = await getDataStore().getStaff(str(fd, "owner", 80));
    if (!owner || !canSeeMember(v, owner) || owner.id === v.staffId) throw new InputError("担当メンバーにだけ返せます");
    const body = str(fd, "body", 500);
    const stamp = str(fd, "stamp", 8);
    if (!body && !stamp) throw new InputError("コメントかスタンプを選んでください");
    const settings = await getGoalSettings(getDataStore());
    if (stamp && !settings.stamps.includes(stamp)) throw new InputError("スタンプを選び直してください");
    await fx().goalFeedback.insert({ targetType, targetId, ownerStaffId: owner.id, fromStaffId: v.staffId, body, stamp });
    await notifyStaff(getDataStore(), [owner.id], {
      kind: "goal",
      title: `${stamp ? `${stamp} ` : ""}${shortName(v.session.name)}さんからフィードバック`,
      body: body || (targetType === "reflection" ? "振り返りにスタンプが届きました" : "目標にスタンプが届きました"),
      href: targetType === "reflection" ? "/staff/goals#reflection" : "/staff/goals",
      refId: targetId,
    });
    return "返しました（本人に通知しました）";
  });
  revalidatePath("/staff/goals");
  redirect(resultUrl(back, r));
}

export async function decideSuggestionAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    const decision = str(fd, "decision", 10) === "reject" ? "reject" : "adopt";
    return decideSuggestion(getDataStore(), v.staffId, str(fd, "id", 80), int(fd, "index", -1), decision, str(fd, "text", 60) || undefined);
  });
  revalidatePath("/staff/goals");
  redirect(resultUrl("/staff/goals#suggest", r));
}

export async function createSuggestionAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const scope = str(fd, "scope", 6) === "month" ? "month" : "week";
  const r = await attempt(async () => {
    const s = await getOrCreateSuggestion(getDataStore(), v.staffId, scope);
    if (!s) throw new InputError("作れませんでした");
    return s.ai ? "AIの提案ができました" : "提案を作りました（AIが使えないため、決まった作り方で）";
  });
  revalidatePath("/staff/goals");
  redirect(resultUrl("/staff/goals#suggest", r));
}

export async function saveGoalSettingsAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    if (!v.isAdmin) throw new InputError("管理者だけが変えられます");
    const s = await getGoalSettings(getDataStore());
    await writeJsonSetting(getDataStore(), GOAL_SETTINGS_KEY, {
      ...s,
      areas: linesOf(str(fd, "areas", 1000), { max: 16, maxLength: 20 }),
      stamps: linesOf(str(fd, "stamps", 200), { max: 12, maxLength: 4 }),
      suggestMonthly: bool(fd, "suggest_monthly"),
    });
  });
  redirect(resultUrl("/admin/goals", r));
}
