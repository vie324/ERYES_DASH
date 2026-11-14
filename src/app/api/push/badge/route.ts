// アプリアイコンの赤い数字（バッジ）の件数を返す。
// 件数＝未読のトーク件数＋今日の未完了のタスク・ルーティン（スタイリストの毎日の業務を含む）。
// 通知（Web Push）を受け取ったとき、サービスワーカー（public/sw.js）がここに聞き直して数字を合わせる。
// 本人のセッションCookieで判定するので、ほかの人の件数は返さない。

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, count: 0 }, { status: 401 });
  const db = getDataStore();
  const [tasks, chat] = await Promise.all([
    getMyTaskSummary(db, session.staffId, todayJst()),
    getChatOverview(db, session.staffId),
  ]);
  return NextResponse.json(
    { ok: true, count: tasks.dueCount + chat.totalUnread, tasks: tasks.dueCount, unread: chat.totalUnread },
    { headers: { "Cache-Control": "no-store" } }
  );
}
