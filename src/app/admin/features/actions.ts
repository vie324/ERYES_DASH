"use server";

// 依頼10〜23の「追加機能の設定」の保存と、定時実行の「今すぐ実行」（管理者だけ）。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { attempt, resultUrl, str, int, InputError } from "@/lib/action-utils";
import { linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { GUIDE_LABEL, GUIDES_KEY, getGuides, parseGuideLines, type GuideKey } from "@/lib/guides";
import { WIKI_SETTINGS_KEY } from "@/lib/wiki";
import { ATTENDANCE_SETTINGS_KEY } from "@/lib/attendance-shift";
import { INVENTORY_SETTINGS_KEY } from "@/lib/inventory";
import { UTILIZATION_SETTINGS_KEY } from "@/lib/utilization";
import { AI_FEATURE_LABEL, AI_LIMITS_KEY, type AiFeature } from "@/lib/ai/run";
import { jobByKey } from "@/lib/jobs";
import { runJob } from "@/lib/jobs/runner";
import { todayJst } from "@/lib/date";

const BACK = "/admin/features";
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export async function saveGuidesAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const db = getDataStore();
    const current = await getGuides(db);
    const next = { ...current };
    for (const k of Object.keys(GUIDE_LABEL) as GuideKey[]) {
      const cards = parseGuideLines(str(fd, `guide_${k}`, 4000)).slice(0, 6);
      if (cards.length === 0) throw new InputError(`「${GUIDE_LABEL[k]}」の案内を1枚以上入れてください`);
      next[k] = cards;
    }
    await writeJsonSetting(db, GUIDES_KEY, next);
    return "案内の文を保存しました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#guides`, r));
}

export async function saveWikiSettingsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const categories = linesOf(str(fd, "categories", 1000), { max: 30, maxLength: 20 });
    if (categories.length === 0) throw new InputError("カテゴリを1つ以上入れてください");
    await writeJsonSetting(getDataStore(), WIKI_SETTINGS_KEY, { categories });
    return "Wikiのカテゴリを保存しました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#wiki`, r));
}

export async function saveNumbersSettingsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const db = getDataStore();
    await writeJsonSetting(db, ATTENDANCE_SETTINGS_KEY, {
      graceMinutes: clamp(int(fd, "graceMinutes", 5), 0, 60),
      breakAfterMinutes: clamp(int(fd, "breakAfterMinutes", 360), 0, 1440),
      breakMinutes: clamp(int(fd, "breakMinutes", 60), 0, 240),
    });
    await writeJsonSetting(db, INVENTORY_SETTINGS_KEY, {
      diffUnits: clamp(int(fd, "diffUnits", 2), 1, 1000),
      diffPercent: clamp(int(fd, "diffPercent", 10), 1, 100),
      notifyHour: clamp(int(fd, "notifyHour", 10), 0, 23),
    });
    const good = clamp(int(fd, "goodRate", 70), 1, 100);
    const low = clamp(int(fd, "lowRate", 40), 0, 100);
    if (low >= good) throw new InputError("稼働率の「注意」は「よい」より小さくしてください");
    await writeJsonSetting(db, UTILIZATION_SETTINGS_KEY, { eyesBreakMinutes: clamp(int(fd, "eyesBreakMinutes", 60), 0, 240), goodRate: good, lowRate: low });
    return "保存しました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#numbers`, r));
}

export async function saveAiLimitsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const limits = Object.fromEntries((Object.keys(AI_FEATURE_LABEL) as AiFeature[]).map((k) => [k, clamp(int(fd, `limit_${k}`, 0), 0, 1000)]));
    await writeJsonSetting(getDataStore(), AI_LIMITS_KEY, limits);
    return "AIの1日の上限を保存しました";
  });
  revalidatePath("/admin/ai-usage");
  redirect(resultUrl("/admin/ai-usage", r));
}

/** 定時実行の仕事を今すぐ回す（時刻の判定を飛ばす。同じ日の通知は仕事の側で二重にしない） */
export async function runJobNowAction(fd: FormData) {
  await requireAdmin();
  const key = str(fd, "job", 40);
  const job = jobByKey(key);
  const r = await attempt(async () => {
    if (!job) throw new InputError("仕事が見つかりません");
    const out = await runJob(job, { db: getDataStore(), now: new Date(), today: todayJst(), slotHour: 23, force: true }, { ignoreRunKey: true });
    if (out.status === "error") throw new InputError(`「${job.label}」でエラー：${out.detail}`);
    return `「${job.label}」：${out.detail}`;
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}#jobs`, r));
}
