// 依頼14：定時実行の仕事（まだの入力の通知・インセンティブの締め日前の通知）

import { addDays, addMonths, monthRange } from "@/lib/date";
import { notifyStaff } from "@/lib/notify";
import { computeMissing, getRequiredInputsSettings } from "@/lib/required-inputs";
import { getIncentiveSettings, incentiveDeadline } from "@/lib/required-inputs/incentive";
import type { JobContext } from "@/lib/jobs/runner";

/** 閉店後（初期値19時）：今日の必須入力が残っている人にプッシュ通知（ホームの帯は入力するまで出続ける） */
export async function requiredInputsNotifyJob(ctx: JobContext): Promise<string> {
  const missing = await computeMissing(ctx.db, { from: ctx.today, to: ctx.today });
  let n = 0;
  for (const [staffId, list] of missing) {
    const labels = [...new Set(list.map((m) => m.label))];
    await notifyStaff(ctx.db, [staffId], {
      kind: "input",
      title: "まだの入力があります",
      body: `今日の${labels.join("・")}がまだです。ホームから入力してください`,
      href: "/staff",
      refId: `missing-${ctx.today}`,
      inbox: false,
      tag: "missing-inputs",
    });
    n++;
  }
  return `${n}人に通知`;
}

export async function requiredInputsDue(ctx: JobContext): Promise<boolean> {
  const s = await getRequiredInputsSettings(ctx.db);
  return s.enabled && ctx.slotHour >= s.notifyHour;
}

/** インセンティブの締め日の◯日前〜当日：その月の未入力が残っている人に毎日知らせる */
export async function incentiveReminderJob(ctx: JobContext): Promise<string> {
  const settings = await getIncentiveSettings(ctx.db);
  // 締め日が近い月（今月の分は翌月が締め日、先月の分は今月が締め日）
  const months = [addMonths(ctx.today.slice(0, 7), -1), ctx.today.slice(0, 7)];
  let n = 0;
  for (const month of months) {
    const deadline = incentiveDeadline(month, settings);
    if (ctx.today > deadline || ctx.today < addDays(deadline, -settings.reminderDaysBefore)) continue;
    const { from, to } = monthRange(month);
    const missing = await computeMissing(ctx.db, { from, to });
    for (const [staffId, list] of missing) {
      const relevant = list.filter((m) => settings.keys.includes(m.key));
      if (relevant.length === 0) continue;
      await notifyStaff(ctx.db, [staffId], {
        kind: "input",
        title: `インセンティブの締め日（${deadline.slice(5).replace("-", "/")}）が近づいています`,
        body: `未入力が${relevant.length}件あります。締め日までに入れたものだけが使われます`,
        href: `/staff/incentive?month=${month}`,
        refId: `incentive-${month}`,
        inbox: false,
        tag: "incentive-deadline",
      });
      n++;
    }
  }
  return `${n}人に通知`;
}
