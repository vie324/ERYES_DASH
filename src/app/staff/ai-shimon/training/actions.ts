"use server";

// 依頼11（69）：AIしもんの教育（代表だけ）。画面だけでなく、ここでも必ず権限を確かめる。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { InputError, attempt, resultUrl, str } from "@/lib/action-utils";
import {
  TRAINING_KINDS,
  createTraining,
  deleteTraining,
  moveTraining,
  restoreRevision,
  updateTraining,
} from "@/lib/ai-shimon/training";
import { fx } from "@/lib/data/tables";
import { getDataStore } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/session";
import { writeJsonSetting } from "@/lib/feature-settings";
import { AI_SHIMON_SETTINGS_KEY, DEFAULT_AI_SHIMON_SETTINGS } from "@/lib/ai-shimon/training";

const BACK = "/staff/ai-shimon/training";

async function requireTrainer(): Promise<string> {
  const session = await requireSession();
  if (!(await hasPermission(session, "ai_shimon_training"))) redirect("/staff/ai-shimon");
  return session.staffId;
}

function kindOf(fd: FormData): string {
  const k = str(fd, "kind", 20);
  if (!TRAINING_KINDS.some((x) => x.key === k)) throw new InputError("種類を選んでください");
  return k;
}

export async function createTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const r = await attempt(async () => {
    const body = str(fd, "body", 4000);
    if (!body) throw new InputError("中身を入れてください");
    // 相談を見ながら足したときの元の相談（代表の画面でだけ使う。AIには渡さない）
    const sourceStaffId = str(fd, "source_staff", 80) || null;
    const sourceThreadId = str(fd, "source_thread", 80);
    if (sourceStaffId && !(await getDataStore().getStaff(sourceStaffId))) throw new InputError("元の相談が見つかりません");
    await createTraining({ kind: kindOf(fd), title: str(fd, "title", 80), body, editedBy: me, sourceStaffId, sourceThreadId });
    return "教育に足しました。次の相談から、AIしもんの答えに反映されます";
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

export async function updateTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const body = str(fd, "body", 4000);
    if (!body) throw new InputError("中身を入れてください");
    const row = await updateTraining(id, { kind: kindOf(fd), title: str(fd, "title", 80), body }, me);
    if (!row) throw new InputError("項目が見つかりません");
  }, "直しました（変更の履歴に残りました）");
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#tr-${id}`, r));
}

export async function toggleTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const row = await fx().aiTrainings.get(id);
    if (!row) throw new InputError("項目が見つかりません");
    await updateTraining(id, { isActive: !row.isActive }, me, row.isActive ? "stop" : "start");
    return row.isActive ? "止めました（AIしもんの答えに使いません）" : "使うようにしました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#tr-${id}`, r));
}

export async function moveTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const id = str(fd, "id", 80);
  const dir = str(fd, "dir", 4) === "up" ? "up" : "down";
  await moveTraining(id, dir, me).catch(() => undefined);
  revalidatePath(BACK);
  redirect(`${BACK}#tr-${id}`);
}

export async function deleteTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    await deleteTraining(id, me);
  }, "消しました（変更の履歴から戻せます）");
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

export async function restoreTrainingAction(fd: FormData): Promise<void> {
  const me = await requireTrainer();
  const rev = str(fd, "revision", 80);
  const r = await attempt(async () => {
    const row = await restoreRevision(rev, me);
    if (!row) throw new InputError("履歴が見つかりません");
  }, "この状態に戻しました");
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

/** スタッフの画面の注意書き（管理者がマスタ設定で変える。空にすると初期の文） */
export async function saveAiShimonNoticeAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const notice = str(fd, "notice", 200) || DEFAULT_AI_SHIMON_SETTINGS.notice;
  const r = await attempt(async () => {
    await writeJsonSetting(getDataStore(), AI_SHIMON_SETTINGS_KEY, { notice });
  });
  revalidatePath("/staff/ai-shimon");
  redirect(resultUrl("/admin/features#ai-shimon", r));
}
