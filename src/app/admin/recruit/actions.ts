"use server";

// 依頼23：面接の設定（段階・経路・評価シートの項目・録画の保存期間・同意の文）。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { attempt, resultUrl, str, int, InputError } from "@/lib/action-utils";
import { linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { DEFAULT_RECRUIT_SETTINGS, RECRUIT_SETTINGS_KEY, parseEvaluationLines } from "@/lib/recruit";

const BACK = "/admin/recruit";

export async function saveRecruitSettingsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const items = parseEvaluationLines(str(fd, "items", 3000));
    if (items.length === 0) throw new InputError("評価シートの項目を1つ以上入れてください");
    const stages = linesOf(str(fd, "stages", 1000), { max: 20, maxLength: 30 });
    const sources = linesOf(str(fd, "sources", 1000), { max: 20, maxLength: 30 });
    await writeJsonSetting(getDataStore(), RECRUIT_SETTINGS_KEY, {
      stages: stages.length ? stages : DEFAULT_RECRUIT_SETTINGS.stages,
      sources: sources.length ? sources : DEFAULT_RECRUIT_SETTINGS.sources,
      evaluationItems: items,
      retentionMonths: Math.min(60, Math.max(1, int(fd, "retentionMonths", DEFAULT_RECRUIT_SETTINGS.retentionMonths))),
      consentText: str(fd, "consentText", 500) || DEFAULT_RECRUIT_SETTINGS.consentText,
      maxInterviewers: Math.min(5, Math.max(1, int(fd, "maxInterviewers", DEFAULT_RECRUIT_SETTINGS.maxInterviewers))),
    });
    return "保存しました（保存期間を変えた場合、これから選考が終わる人の録画から使われます）";
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}
