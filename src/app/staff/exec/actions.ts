"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ROUTINE_CYCLES } from "@/lib/eni/routines";
import type { RoutineCycle } from "@/lib/data/types";

/** 日報の気づきを「確認済み」にする／戻す（幹部のみ） */
export async function toggleNoticeCheckAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const reportId = String(formData.get("report_id") ?? "");
  const checked = String(formData.get("checked") ?? "") === "1";
  if (!reportId) redirect("/staff/exec?tab=notices&error=input");

  await getDataStore().setExecNoticeChecked(reportId, session.staffId, checked);
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=notices");
}


// ---- 店長・副店長のルーティン業務 ----

/** 入力された周期を daily/weekly/monthly に丸める */
function cycleField(formData: FormData): RoutineCycle {
  const raw = String(formData.get("cycle") ?? "daily");
  return (ROUTINE_CYCLES as string[]).includes(raw) ? (raw as RoutineCycle) : "daily";
}

/** その日（週・月）の分をやった／やっていないを切り替える */
export async function toggleRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const routineId = String(formData.get("routine_id") ?? "");
  const periodKey = String(formData.get("period_key") ?? "");
  const done = String(formData.get("done") ?? "") === "1";
  if (!routineId || !periodKey) redirect("/staff/exec?tab=routines&error=input");

  await getDataStore().setManagerRoutineChecked(routineId, periodKey, session.staffId, done);
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=routines");
}

/** ルーティン業務の追加（マスタ） */
export async function createRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!title) redirect("/staff/exec?tab=routines&error=input");

  const db = getDataStore();
  const existing = await db.listManagerRoutines();
  const cycle = cycleField(formData);
  const sameCycle = existing.filter((r) => r.cycle === cycle);

  await db.createManagerRoutine({
    title,
    cycle,
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    sortOrder: (sameCycle.length + 1) * 10,
    isActive: true,
  });
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=routines&saved=1");
}

/** ルーティン業務の編集（マスタ） */
export async function updateRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const id = String(formData.get("routine_id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!id || !title) redirect("/staff/exec?tab=routines&error=input");

  const sortOrder = Math.max(0, Math.round(Number(formData.get("sort_order")) || 0));
  await getDataStore().updateManagerRoutine(id, {
    title,
    cycle: cycleField(formData),
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    sortOrder,
    isActive: formData.get("is_active") === "on",
  });
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=routines&saved=1");
}

/** ルーティン業務の削除（マスタ。実施記録も一緒に消える） */
export async function deleteRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const id = String(formData.get("routine_id") ?? "");
  if (formData.get("confirm") !== "on") redirect("/staff/exec?tab=routines&error=confirm");
  if (id) await getDataStore().deleteManagerRoutine(id);
  revalidatePath("/staff/exec");
  redirect("/staff/exec?tab=routines&saved=deleted");
}
