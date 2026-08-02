"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PYRAMID_SETTINGS, allAssistantSettingKeys } from "@/lib/eni/forms";

/** ピラミッド（価値観・理想の未来像・目標）を保存。設定は週報の先頭に常時表示される */
export async function savePyramidAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const db = getDataStore();
  for (const def of PYRAMID_SETTINGS) {
    const content = String(formData.get(def.key) ?? "").trim().slice(0, 500);
    await db.upsertAssistantSetting(session.staffId, def.key, content);
  }
  revalidatePath("/staff/weekly-report");
  redirect("/staff/weekly-report?saved=settings");
}

/** 年内目標・自分との約束・デビュー設定などを保存（ランクに応じた項目） */
export async function saveAssistantSettingsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const db = getDataStore();
  const allowed = new Set(allAssistantSettingKeys());
  for (const [key, value] of formData.entries()) {
    if (!allowed.has(key)) continue;
    await db.upsertAssistantSetting(session.staffId, key, String(value).trim().slice(0, 1000));
  }
  revalidatePath("/staff/weekly-report");
  redirect("/staff/weekly-report?saved=settings");
}
