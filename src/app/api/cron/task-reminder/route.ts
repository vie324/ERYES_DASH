// 残っているタスク・未読のリマインド（毎朝。時刻はマスタ設定で選ぶ・初期値 9:00 JST）
// 「今日やること」（タスク・ルーティン・スタイリストの毎日の業務）や未読が残っている人に通知し、
// アプリアイコンのバッジ（未読トーク＋今日の未完了）も更新する。
// vercel.json に日本時間 6〜12時の定時実行を1日1回ずつ登録してあり、選んだ時刻の回だけ送る（lib/push/morning.ts）。
// 本人が「通知の設定」で「毎朝のリマインド」を止めていれば送らない。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { env, isPushConfigured } from "@/lib/env";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { sendPush } from "@/lib/push/notify";
import { dayoffDeadlineReminder } from "@/lib/shift/notify";
import { MORNING_REMINDER_HOUR_KEY, choiceSettingOf } from "@/lib/settings";
import {
  MORNING_REMINDER_SENT_KEY,
  currentJstHour,
  jstHourFromCronSchedule,
  shouldSendMorningReminder,
} from "@/lib/push/morning";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: "認証エラー" }, { status: 401 });
    }
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: true, skipped: "push not configured" });
  }

  const db = getDataStore();
  const today = todayJst();

  // どの時刻の回か（定時実行の式から。手で呼んだときは今の時刻）。選んだ時刻の回だけ送る
  const settings = await db.listAppSettings();
  const slotHour = jstHourFromCronSchedule(req.headers.get("x-vercel-cron-schedule")) ?? currentJstHour();
  const configuredHour = Number(choiceSettingOf(settings, MORNING_REMINDER_HOUR_KEY));
  const lastSentOn = settings.find((r) => r.key === MORNING_REMINDER_SENT_KEY)?.value ?? "";
  // 動作確認用：?force=1 で時刻・1日1回の判定を飛ばす（CRON_SECRET を設定しているときか、本番以外だけ）
  const force =
    req.nextUrl.searchParams.get("force") === "1" && (Boolean(env.cronSecret) || process.env.NODE_ENV !== "production");
  if (!force && !shouldSendMorningReminder({ slotHour, configuredHour, lastSentOn, today })) {
    return NextResponse.json({ ok: true, skipped: "not this slot", slotHour, configuredHour, lastSentOn });
  }
  // 先に「今日は送った」を残す（同じ回が2回呼ばれても二重に送らない）
  await db.setAppSetting(MORNING_REMINDER_SENT_KEY, today);
  const staffList = (await db.listStaff()).filter((s) => s.isActive);
  // 購読のある人だけ処理する（無い人の集計はしない）
  const subscribed = new Set((await db.listPushSubscriptions(staffList.map((s) => s.id))).map((p) => p.staffId));

  // 希望休の締切が近い（3日前〜当日）ときは、まだ出していない人に一緒に知らせる
  const dayoff = await dayoffDeadlineReminder(db, today);

  let notified = 0;
  for (const staff of staffList) {
    if (!subscribed.has(staff.id)) continue;
    const [tasks, chat] = await Promise.all([
      getMyTaskSummary(db, staff.id, today),
      getChatOverview(db, staff.id, staffList),
    ]);
    const badge = tasks.dueCount + chat.totalUnread;
    const dayoffDue = dayoff?.staffIds.has(staff.id) ?? false;
    if (tasks.dueCount === 0 && chat.totalUnread === 0 && !dayoffDue) continue;
    const parts = [
      tasks.dueCount > 0 ? `今日のタスク ${tasks.dueCount}件` : "",
      chat.totalUnread > 0 ? `未読のトーク ${chat.totalUnread}件` : "",
    ].filter(Boolean);
    const lines = [parts.length > 0 ? `${parts.join("・")}が残っています` : "", dayoffDue ? dayoff!.text : ""].filter(
      Boolean
    );
    await sendPush(db, [staff.id], {
      title: "おはようございます",
      body: lines.join("。"),
      url: dayoffDue ? dayoff!.url : tasks.dueCount > 0 ? "/staff/tasks" : "/staff/chat",
      tag: "daily-reminder",
      badge,
      kind: "morning",
    });
    notified++;
  }
  console.log(`[cron] タスク・未読リマインド（${slotHour}時の回）: ${notified}名へ送信`);
  return NextResponse.json({ ok: true, notified, slotHour, configuredHour });
}
