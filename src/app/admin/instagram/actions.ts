"use server";

// 依頼22：Instagramの数字の集め方（数字の名前・APIの版）と、今すぐ集める。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { attempt, resultUrl, str, int, InputError } from "@/lib/action-utils";
import { linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { DEFAULT_INSTAGRAM_SETTINGS, INSTAGRAM_SETTINGS_KEY, instagramSyncJob } from "@/lib/instagram";
import { todayJst } from "@/lib/date";

const BACK = "/admin/instagram";

export async function saveInstagramSettingsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const version = str(fd, "graphVersion", 10);
    if (!/^v\d{1,2}\.\d$/.test(version)) throw new InputError("APIの版は v24.0 のような形で入れてください");
    const names = (key: string) => linesOf(str(fd, key, 2000), { max: 30, maxLength: 60 }).filter((x) => /^[a-z0-9_]+$/.test(x));
    const labels: Record<string, string> = {};
    for (const line of linesOf(str(fd, "labels", 3000), { max: 60, maxLength: 80 })) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length && /^[a-z0-9_]+$/.test(k.trim())) labels[k.trim()] = rest.join("=").trim().slice(0, 20);
    }
    await writeJsonSetting(getDataStore(), INSTAGRAM_SETTINGS_KEY, {
      graphVersion: version,
      accountMetrics: names("accountMetrics"),
      mediaMetrics: names("mediaMetrics"),
      mediaLimit: Math.min(25, Math.max(1, int(fd, "mediaLimit", DEFAULT_INSTAGRAM_SETTINGS.mediaLimit))),
      labels,
    });
    return "保存しました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

export async function syncInstagramNowAction() {
  await requireAdmin();
  const r = await attempt(async () => `集めました：${await instagramSyncJob(getDataStore(), todayJst())}`);
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}
