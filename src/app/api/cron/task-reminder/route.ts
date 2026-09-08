// 残っているタスク・未読のリマインド（毎朝 9:00 JST に Vercel Cron から実行。vercel.json参照）
// 「今日やること」が残っている人に通知し、アプリアイコンのバッジ（未読トーク＋今日のタスク）も更新する。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { env, isPushConfigured } from "@/lib/env";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";
import { sendPush } from "@/lib/push/notify";

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
  const staffList = (await db.listStaff()).filter((s) => s.isActive);
  // 購読のある人だけ処理する（無い人の集計はしない）
  const subscribed = new Set((await db.listPushSubscriptions(staffList.map((s) => s.id))).map((p) => p.staffId));

  let notified = 0;
  for (const staff of staffList) {
    if (!subscribed.has(staff.id)) continue;
    const [tasks, chat] = await Promise.all([
      getMyTaskSummary(db, staff.id, today),
      getChatOverview(db, staff.id, staffList),
    ]);
    const badge = tasks.dueCount + chat.totalUnread;
    if (tasks.dueCount === 0 && chat.totalUnread === 0) continue;
    const parts = [
      tasks.dueCount > 0 ? `今日のタスク ${tasks.dueCount}件` : "",
      chat.totalUnread > 0 ? `未読のトーク ${chat.totalUnread}件` : "",
    ].filter(Boolean);
    await sendPush(db, [staff.id], {
      title: "おはようございます",
      body: `${parts.join("・")}が残っています`,
      url: tasks.dueCount > 0 ? "/staff/tasks" : "/staff/chat",
      tag: "daily-reminder",
      badge,
    });
    notified++;
  }
  console.log(`[cron] タスク・未読リマインド: ${notified}名へ送信`);
  return NextResponse.json({ ok: true, notified });
}
