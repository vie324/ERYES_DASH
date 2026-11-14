// 朝の画面の「今日のタスク」を返す（本人の分だけ）。
// 1人1日1回だけ作って保存する（2回目からは保存した分を返す。開くたびにはAIを呼ばない）。
// 本人のセッションCookieで判定するので、ほかの人の分は返さない。

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { getTodayBrief } from "@/lib/home/brief";

export const dynamic = "force-dynamic";
// AIで作るときだけ数秒かかる
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, items: [] }, { status: 401 });
  const brief = await getTodayBrief(getDataStore(), session.staffId, todayJst());
  return NextResponse.json(
    { ok: true, date: brief.date, items: brief.items, ai: brief.ai },
    { headers: { "Cache-Control": "no-store" } }
  );
}
