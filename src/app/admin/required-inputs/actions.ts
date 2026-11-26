"use server";

// 依頼14：必須入力・インセンティブの締め日・予定の確認の設定（管理者だけ）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { attempt, bool, resultUrl, str } from "@/lib/action-utils";
import { intIn, writeJsonSetting } from "@/lib/feature-settings";
import { AUDIENCE_LABEL, INPUT_DEFS, REQUIRED_INPUTS_KEY, type Audience, type InputKey } from "@/lib/required-inputs";
import { INCENTIVE_SETTINGS_KEY } from "@/lib/required-inputs/incentive";
import { CONFIRM_GATE_KEY } from "@/lib/confirm-gate";

export async function saveRequiredInputsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const r = await attempt(async () => {
    const db = getDataStore();
    const keys = Object.keys(INPUT_DEFS) as InputKey[];
    const rules = Object.fromEntries(
      (Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => [a, keys.filter((k) => bool(fd, `rule_${a}_${k}`))])
    ) as Record<Audience, InputKey[]>;
    await writeJsonSetting(db, REQUIRED_INPUTS_KEY, {
      enabled: bool(fd, "enabled"),
      rules,
      notifyHour: intIn(fd.get("notify_hour"), 0, 23, 19),
      includeAdmins: bool(fd, "include_admins"),
    });
    await writeJsonSetting(db, INCENTIVE_SETTINGS_KEY, {
      deadlineDay: intIn(fd.get("deadline_day"), 1, 28, 3),
      reminderDaysBefore: intIn(fd.get("reminder_days"), 0, 14, 3),
      keys: keys.filter((k) => bool(fd, `inc_${k}`)),
    });
    const ce = str(fd, "company_events", 10);
    await writeJsonSetting(db, CONFIRM_GATE_KEY, {
      enabled: bool(fd, "gate_enabled"),
      companyEvents: ce === "all" || ce === "off" ? ce : "required",
      myShift: bool(fd, "gate_shift"),
      myMeetings: bool(fd, "gate_meetings"),
      personalEvents: bool(fd, "gate_personal"),
      windowDays: intIn(fd.get("gate_window"), 7, 180, 60),
    });
  });
  revalidatePath("/staff");
  redirect(resultUrl("/admin/required-inputs", r));
}
