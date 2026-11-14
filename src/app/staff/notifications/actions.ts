"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { PUSH_KINDS, normalizeDisabledKinds } from "@/lib/push/kinds";
import { sendPush } from "@/lib/push/notify";

/**
 * 受け取る通知の種類を保存する（本人の分だけ）。
 * 画面に出している種類のうち、チェックを外したものを「止める」として保存する。
 */
export async function savePushPreferencesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const isExec = await isExecutive(session);
  const shown = PUSH_KINDS.filter((k) => !k.execOnly || isExec).map((k) => k.key);
  const enabled = new Set(formData.getAll("kinds").map(String));
  const db = getDataStore();
  // 画面に出していない種類（幹部向けなど）は、いまの設定をそのまま残す
  const current = (await db.listPushPreferences([session.staffId]))[0]?.disabledKinds ?? [];
  const keep = current.filter((k) => !shown.includes(k as (typeof shown)[number]));
  const disabled = normalizeDisabledKinds([...keep, ...shown.filter((k) => !enabled.has(k))]);
  await db.setPushPreference(session.staffId, disabled);
  revalidatePath("/staff/notifications");
  redirect("/staff/notifications?saved=1");
}

/** この人の全端末へテスト通知を送る（届くかの確認用。種類の設定に関係なく送る） */
export async function sendTestPushAction(): Promise<{ sent: number; failed: number }> {
  const session = await requireSession();
  return sendPush(getDataStore(), [session.staffId], {
    title: "テスト通知",
    body: "通知は届いています。アプリのアイコンの数字も確認してください。",
    url: "/staff/notifications",
    tag: "test",
  });
}
