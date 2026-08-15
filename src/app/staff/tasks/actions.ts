"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { todayJst } from "@/lib/date";
import type { TaskRepeat, TaskStatus } from "@/lib/data/types";

/** リダイレクト先（アプリ内のみ許可。改ざん対策） */
function backOf(formData: FormData, fallback = "/staff/tasks"): string {
  const back = String(formData.get("back") ?? "");
  return back.startsWith("/staff/") ? back : fallback;
}

function refresh(): void {
  revalidatePath("/staff/tasks");
  revalidatePath("/staff/exec");
  revalidatePath("/staff");
}

/** 繰り返し設定をフォームから読み取る */
function parseRepeat(formData: FormData): { repeat: TaskRepeat; repeatDays: number[] } {
  const raw = String(formData.get("repeat") ?? "");
  if (raw === "daily") return { repeat: "daily", repeatDays: [] };
  if (raw === "weekly") {
    const days = formData
      .getAll("repeat_weekdays")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return { repeat: "weekly", repeatDays: [...new Set(days)].sort((a, b) => a - b) };
  }
  if (raw === "monthly") {
    const day = Math.round(Number(formData.get("repeat_monthday")) || 0);
    return { repeat: "monthly", repeatDays: day >= 1 && day <= 31 ? [day] : [1] };
  }
  return { repeat: "", repeatDays: [] };
}

/** 自分のタスク（ルーティン・単発）を作成 */
export async function createRoutineTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const { repeat, repeatDays } = parseRepeat(formData);

  if (!title || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    redirect(`${back}?error=input`);
  }
  if (repeat === "weekly" && repeatDays.length === 0) {
    redirect(`${back}?error=input`);
  }

  await getDataStore().createStaffTask({
    kind: "routine",
    title,
    note,
    assigneeStaffId: session.staffId,
    createdBy: session.staffId,
    dueDate: repeat ? "" : dueDate,
    repeat,
    repeatDays,
    status: "open",
  });
  refresh();
  redirect(`${back}?saved=1`);
}

/** タスクを誰かに依頼する */
export async function createRequestTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const assigneeStaffId = String(formData.get("assignee") ?? "");
  const dueDate = String(formData.get("due_date") ?? "").trim();

  const db = getDataStore();
  const assignee = assigneeStaffId ? await db.getStaff(assigneeStaffId) : null;
  if (!title || !assignee || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    redirect(`${back}?error=input`);
  }

  await db.createStaffTask({
    kind: "request",
    title,
    note,
    assigneeStaffId,
    createdBy: session.staffId,
    dueDate,
    repeat: "",
    repeatDays: [],
    status: "open",
  });
  refresh();
  redirect(`${back}?saved=request`);
}

/** 幹部タスクを作成（幹部のみ。担当者・繰り返しを設定できる） */
export async function createExecTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");
  const back = backOf(formData, "/staff/exec");
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const assigneeStaffId = String(formData.get("assignee") ?? "");
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const { repeat, repeatDays } = parseRepeat(formData);

  const db = getDataStore();
  const assignee = assigneeStaffId ? await db.getStaff(assigneeStaffId) : null;
  if (!title || !assignee || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    redirect(`${back}?error=input`);
  }
  if (repeat === "weekly" && repeatDays.length === 0) {
    redirect(`${back}?error=input`);
  }

  await db.createStaffTask({
    kind: "exec",
    title,
    note,
    assigneeStaffId,
    createdBy: session.staffId,
    dueDate: repeat ? "" : dueDate,
    repeat,
    repeatDays,
    status: "open",
  });
  refresh();
  redirect(`${back}?saved=1`);
}

/** タスクの完了・取り消し（繰り返しは日別、単発は状態を切り替え） */
export async function toggleTaskDoneAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const taskId = String(formData.get("task_id") ?? "");
  const done = String(formData.get("done") ?? "") === "1";
  const date = String(formData.get("date") ?? todayJst());

  const db = getDataStore();
  const task = await db.getStaffTask(taskId);
  if (!task) redirect(`${back}?error=notfound`);

  const canToggle =
    task!.assigneeStaffId === session.staffId ||
    task!.createdBy === session.staffId ||
    (await isExecutive(session));
  if (!canToggle) redirect(`${back}?error=forbidden`);

  if (task!.repeat) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`${back}?error=input`);
    await db.setTaskCompletion(taskId, date, session.staffId, done);
  } else {
    await db.updateStaffTask(taskId, { status: done ? "done" : "open" });
  }
  refresh();
  redirect(back);
}

/** 単発タスクの進捗変更（未着手・進行中・完了） */
export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const taskId = String(formData.get("task_id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const status: TaskStatus =
    statusRaw === "in_progress" || statusRaw === "done" ? statusRaw : "open";

  const db = getDataStore();
  const task = await db.getStaffTask(taskId);
  if (!task) redirect(`${back}?error=notfound`);

  const canToggle =
    task!.assigneeStaffId === session.staffId ||
    task!.createdBy === session.staffId ||
    (await isExecutive(session));
  if (!canToggle) redirect(`${back}?error=forbidden`);

  await db.updateStaffTask(taskId, { status });
  refresh();
  redirect(back);
}

/** タスクの削除（作成者・担当者本人・幹部のみ） */
export async function deleteTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const taskId = String(formData.get("task_id") ?? "");

  const db = getDataStore();
  const task = await db.getStaffTask(taskId);
  if (!task) redirect(`${back}?error=notfound`);

  const canDelete =
    task!.createdBy === session.staffId ||
    task!.assigneeStaffId === session.staffId ||
    (await isExecutive(session));
  if (!canDelete) redirect(`${back}?error=forbidden`);

  await db.deleteStaffTask(taskId);
  refresh();
  redirect(back);
}

/** 議事録から整理されたタスク（会社のタスク）の完了切り替え */
export async function toggleCompanyMeetingTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const taskId = String(formData.get("task_id") ?? "");
  const done = String(formData.get("done") ?? "") === "1";

  const db = getDataStore();
  const task = (await db.listOpenMeetingTasks()).find((t) => t.id === taskId);
  // 完了→未完了に戻す場合は listOpen に居ないので、担当者チェックは幹部 or 本人でゆるめに
  const canToggle =
    !task || task.assigneeStaffId === session.staffId || (await isExecutive(session));
  if (!canToggle) redirect(`${back}?error=forbidden`);

  await db.setMeetingTaskDone(taskId, done);
  refresh();
  revalidatePath("/staff/meetings");
  redirect(back);
}
