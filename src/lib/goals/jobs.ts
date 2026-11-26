// 依頼19：定時実行（月曜・月初の「やるべきこと」作り、振り返りに返していない幹部への通知）

import { fx } from "@/lib/data/tables";
import { notifyStaff } from "@/lib/notify";
import { getGoalSettings, lastWeekKey, reflectionsWithoutFeedback } from "@/lib/goals";
import { getOrCreateSuggestion } from "@/lib/goals/suggest";
import { weekdayOf } from "@/lib/date";
import type { JobContext } from "@/lib/jobs/runner";

/** 月曜（と月のはじめ）：目標を持っている人の分だけ、先に作っておく（費用を抑えるため。ほかの人は画面から作る） */
export async function goalSuggestJob(ctx: JobContext): Promise<string> {
  const settings = await getGoalSettings(ctx.db);
  const isWeekDay = weekdayOf(ctx.today) === settings.suggestWeekday;
  const isMonthStart = settings.suggestMonthly && ctx.today.endsWith("-01");
  if (!isWeekDay && !isMonthStart && !ctx.force) return "この日は作りません";
  const owners = [...new Set((await fx().goals.list({ where: { level: "personal", isActive: true } })).map((g) => g.staffId).filter((x): x is string => Boolean(x)))];
  let n = 0;
  for (const staffId of owners) {
    if (isWeekDay || ctx.force) {
      const s = await getOrCreateSuggestion(ctx.db, staffId, "week");
      if (s) n++;
    }
    if (isMonthStart) await getOrCreateSuggestion(ctx.db, staffId, "month");
  }
  if (n > 0) {
    await notifyStaff(ctx.db, owners, {
      kind: "goal",
      title: "今週いちばんやるべきこと",
      body: "目標と進み具合から、今週やることの提案ができました。採用するとタスクになります",
      href: "/staff/goals#suggest",
      refId: `suggest-${ctx.today}`,
      inbox: false,
    });
  }
  return `${n}人分を作りました`;
}

/** 先週の振り返りに、まだ何も返していない幹部に知らせる（初期値：水曜） */
export async function feedbackReminderJob(ctx: JobContext): Promise<string> {
  const settings = await getGoalSettings(ctx.db);
  if (weekdayOf(ctx.today) !== settings.feedbackReminderWeekday && !ctx.force) return "この日は知らせません";
  const pending = await reflectionsWithoutFeedback(lastWeekKey(ctx.today));
  if (pending.length === 0) return "返していない振り返りはありません";
  const staff = (await ctx.db.listStaff()).filter((s) => s.isActive);
  const byExec = new Map<string, string[]>();
  for (const p of pending) {
    const member = staff.find((s) => s.id === p.staffId);
    if (!member) continue;
    for (const e of staff.filter((s) => s.isExecutive && s.storeId === member.storeId && s.id !== member.id)) {
      byExec.set(e.id, [...(byExec.get(e.id) ?? []), member.name]);
    }
  }
  for (const [execId, names] of byExec) {
    await notifyStaff(ctx.db, [execId], {
      kind: "goal",
      title: "振り返りへの返事がまだです",
      body: `${names.slice(0, 3).join("・")}${names.length > 3 ? `ほか${names.length - 3}人` : ""}さんの先週の振り返りに、まだ返していません`,
      href: "/staff/goals/team",
      refId: `feedback-${lastWeekKey(ctx.today)}`,
    });
  }
  return `${byExec.size}人の幹部に知らせました`;
}
