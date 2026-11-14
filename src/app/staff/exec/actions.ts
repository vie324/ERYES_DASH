"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ROUTINE_CYCLES, normalizeAudience, periodKeyOf } from "@/lib/eni/routines";
import { todayJst } from "@/lib/date";
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


// ---- 毎日の業務（幹部＝店長・副店長のルーティン業務／スタイリストの毎日の業務） ----

/** 入力された周期を daily/weekly/monthly に丸める */
function cycleField(formData: FormData): RoutineCycle {
  const raw = String(formData.get("cycle") ?? "daily");
  return (ROUTINE_CYCLES as string[]).includes(raw) ? (raw as RoutineCycle) : "daily";
}

/** 幹部メニューのルーティンタブへ戻るURL（店舗を選んでいればそのまま） */
function routinesHref(storeId: string, extra = ""): string {
  const store = storeId ? `&store=${encodeURIComponent(storeId)}` : "";
  return `/staff/exec?tab=routines${store}${extra}`;
}

/**
 * 幹部の業務の、その店舗の今日（今週・今月）の分をやった／やっていないを切り替える。
 * 記録は「業務×期間×店舗」で1件（その店舗の幹部の誰かがやればよい）。
 */
export async function toggleRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const routineId = String(formData.get("routine_id") ?? "");
  const periodKey = String(formData.get("period_key") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const done = String(formData.get("done") ?? "") === "1";
  if (!routineId || !periodKey || !storeId) redirect(routinesHref(storeId, "&error=input"));

  const db = getDataStore();
  const [routines, stores] = await Promise.all([db.listManagerRoutines(), db.listStores()]);
  const routine = routines.find((r) => r.id === routineId);
  // 店舗ごとにチェックするのは幹部の業務だけ（スタイリストの業務は本人がタスク画面でチェックする）
  if (!routine || routine.audience !== "exec" || !stores.some((s) => s.id === storeId)) {
    redirect(routinesHref(storeId, "&error=input"));
  }
  // 付け外しできるのは今の期間（今日・今週・今月）の分だけ
  if (periodKey !== periodKeyOf(routine!.cycle, todayJst())) {
    redirect(routinesHref(storeId, "&error=input"));
  }

  await db.setManagerRoutineChecked({
    routineId,
    periodKey,
    subjectKey: storeId,
    storeId,
    staffId: session.staffId,
    checked: done,
  });
  revalidatePath("/staff/exec");
  revalidatePath("/staff");
  redirect(routinesHref(storeId));
}

/** ルーティン業務の追加（マスタ） */
export async function createRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!title) redirect(routinesHref(String(formData.get("store_id") ?? ""), "&error=input"));

  const db = getDataStore();
  const existing = await db.listManagerRoutines();
  const cycle = cycleField(formData);
  const audience = normalizeAudience(formData.get("audience"));
  const sameGroup = existing.filter((r) => r.cycle === cycle && r.audience === audience);

  await db.createManagerRoutine({
    title,
    cycle,
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    sortOrder: (sameGroup.length + 1) * 10,
    isActive: true,
    audience,
  });
  revalidatePath("/staff/exec");
  revalidatePath("/staff/tasks");
  redirect(routinesHref(String(formData.get("store_id") ?? ""), "&saved=1"));
}

/** ルーティン業務の編集（マスタ） */
export async function updateRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const id = String(formData.get("routine_id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!id || !title) redirect(routinesHref(String(formData.get("store_id") ?? ""), "&error=input"));

  const sortOrder = Math.max(0, Math.round(Number(formData.get("sort_order")) || 0));
  await getDataStore().updateManagerRoutine(id, {
    title,
    cycle: cycleField(formData),
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    sortOrder,
    isActive: formData.get("is_active") === "on",
    audience: normalizeAudience(formData.get("audience")),
  });
  revalidatePath("/staff/exec");
  revalidatePath("/staff/tasks");
  redirect(routinesHref(String(formData.get("store_id") ?? ""), "&saved=1"));
}

/** ルーティン業務の削除（マスタ。実施記録も一緒に消える） */
export async function deleteRoutineAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const id = String(formData.get("routine_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  if (formData.get("confirm") !== "on") redirect(routinesHref(storeId, "&error=confirm"));
  if (id) await getDataStore().deleteManagerRoutine(id);
  revalidatePath("/staff/exec");
  revalidatePath("/staff/tasks");
  redirect(routinesHref(storeId, "&saved=deleted"));
}
