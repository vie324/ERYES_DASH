"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { formatDateJa, todayJst } from "@/lib/date";
import { notifyQuietly, shortName } from "@/lib/push/notify";
import { parseTaskForm } from "@/lib/task-form";
import { SELF_TASK_KIND } from "@/lib/tasks";
import { periodKeyOf } from "@/lib/eni/routines";
import type { TaskStatus } from "@/lib/data/types";

/** リダイレクト先（アプリ内のみ許可。改ざん対策） */
function backOf(formData: FormData, fallback = "/staff/tasks"): string {
  const back = String(formData.get("back") ?? "");
  return back.startsWith("/staff/") ? back : fallback;
}

/**
 * 画面の再検証。チェック・進捗・削除はリダイレクトせずにこれだけで済ませる
 * （リダイレクトすると画面が先頭に戻り、続けてチェックできなくなるため）。
 */
function refresh(): void {
  revalidatePath("/staff/tasks");
  revalidatePath("/staff/exec");
  revalidatePath("/staff/eni-report");
  revalidatePath("/staff");
}

/**
 * ルーティン・タスクの登録（タスク画面）。最初に選んだ種類で、要る項目を確かめる。
 *  ・ルーティン …… 自分のルーティン（くり返し）。担当は自分
 *  ・タスク ……… 期限つき。担当が自分以外なら「依頼」になり、担当の人に通知する
 */
export async function createTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const parsed = parseTaskForm(formData);
  if (!parsed.ok) redirect(`${back}?error=${parsed.error}`);
  const form = parsed.value;
  const db = getDataStore();

  if (form.taskType === "routine") {
    await db.createStaffTask({
      taskType: "routine",
      kind: SELF_TASK_KIND,
      title: form.title,
      note: form.note,
      assigneeStaffId: session.staffId,
      createdBy: session.staffId,
      dueDate: "",
      repeat: form.repeat,
      repeatDays: form.repeatDays,
      status: "open",
    });
    refresh();
    redirect(`${back}?saved=routine`);
  }

  const assigneeId = form.assigneeId || session.staffId;
  const assignee = await db.getStaff(assigneeId);
  if (!assignee || !assignee.isActive) redirect(`${back}?error=assignee`);
  const isRequest = assigneeId !== session.staffId;

  await db.createStaffTask({
    taskType: "task",
    kind: isRequest ? "request" : SELF_TASK_KIND,
    title: form.title,
    note: form.note,
    assigneeStaffId: assigneeId,
    createdBy: session.staffId,
    dueDate: form.dueDate,
    repeat: "",
    repeatDays: [],
    status: "open",
  });
  if (isRequest) {
    await notifyQuietly(db, [assigneeId], {
      title: `${shortName(session.name)}さんからタスクの依頼`,
      body: `${form.title}（〜${formatDateJa(form.dueDate)}）`,
      url: "/staff/tasks",
      tag: "task",
    });
  }
  refresh();
  redirect(`${back}?saved=${isRequest ? "request" : "task"}`);
}

/** 幹部タスクを作成（幹部のみ）。ルーティン・タスクのどちらも、担当者を選べる */
export async function createExecTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");
  const back = backOf(formData, "/staff/exec");
  const parsed = parseTaskForm(formData);
  if (!parsed.ok) redirect(`${back}?error=${parsed.error}`);
  const form = parsed.value;

  const db = getDataStore();
  const assigneeStaffId = form.assigneeId || session.staffId;
  const assignee = await db.getStaff(assigneeStaffId);
  if (!assignee || !assignee.isActive) redirect(`${back}?error=assignee`);

  await db.createStaffTask({
    taskType: form.taskType,
    kind: "exec",
    title: form.title,
    note: form.note,
    assigneeStaffId,
    createdBy: session.staffId,
    dueDate: form.dueDate,
    repeat: form.repeat,
    repeatDays: form.repeatDays,
    status: "open",
  });
  if (assigneeStaffId !== session.staffId) {
    await notifyQuietly(db, [assigneeStaffId], {
      title: "幹部タスクが割り当てられました",
      body: `${form.title}${form.dueDate ? `（〜${formatDateJa(form.dueDate)}）` : ""}`,
      url: "/staff/exec",
      tag: "task",
    });
  }
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

  if (task!.taskType === "routine") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`${back}?error=input`);
    await db.setTaskCompletion(taskId, date, session.staffId, done);
  } else {
    await db.updateStaffTask(taskId, { status: done ? "done" : "open" });
  }
  refresh();
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
}

/**
 * スタイリストの毎日の業務（カルテ記入チェック・営業フィードバックなど）を、自分の分としてチェックする。
 * マスタは幹部メニューで編集する。チェックできるのはスタイリスト本人の分だけ。
 */
export async function toggleMyDailyItemAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const back = backOf(formData);
  const routineId = String(formData.get("routine_id") ?? "");
  const done = String(formData.get("done") ?? "") === "1";

  const db = getDataStore();
  const [me, routines] = await Promise.all([db.getStaff(session.staffId), db.listManagerRoutines()]);
  const routine = routines.find((r) => r.id === routineId);
  if (!routine || !routine.isActive || routine.audience !== "stylist") redirect(`${back}?error=notfound`);
  if (!me || me.jobType !== "stylist") redirect(`${back}?error=forbidden`);

  // 付け外しできるのは今の期間（今日・今週・今月）の分だけ（期間はサーバーで決める）
  await db.setManagerRoutineChecked({
    routineId: routine!.id,
    periodKey: periodKeyOf(routine!.cycle, todayJst()),
    subjectKey: me!.id,
    storeId: me!.storeId,
    staffId: me!.id,
    checked: done,
  });
  refresh();
}
