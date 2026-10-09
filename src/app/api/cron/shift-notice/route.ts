// 希望休の募集の定時通知（毎月15日 10:00 JST に Vercel Cron から実行。vercel.json参照）
// 募集中の月（既定では3ヶ月先）の希望休を、まだ出していない人にアプリの通知（Web Push）で知らせる。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { env, isPushConfigured } from "@/lib/env";
import { sendDayoffRequestNotice } from "@/lib/shift/notify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 全スタッフに通知が飛ぶので、CRON_SECRET が無いときは送らない（外から何度も呼ばれて通知が連発しないように）
  if (!env.cronSecret) {
    console.warn("[cron] 希望休の募集通知：CRON_SECRET が未設定のため送信しません");
    return NextResponse.json({ ok: true, skipped: "CRON_SECRET not set" });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: true, skipped: "push not configured" });
  }

  const result = await sendDayoffRequestNotice(getDataStore());
  console.log(
    `[cron] 希望休の募集通知（${result.targetMonth}分）: 未提出 ${result.unsubmitted}名・送信 ${result.sent}端末`
  );
  return NextResponse.json({ ok: true, ...result });
}
