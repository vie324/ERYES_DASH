// シフト希望募集の定時通知（毎月15日 10:00 JST に Vercel Cron から実行。vercel.json参照）
// 翌月分の希望提出を全スタッフへ通知する（現状はモック＝ログ出力。README参照）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { addMonths, thisMonthJst } from "@/lib/date";
import { noticeMessage } from "@/lib/shift/period";
import { sendShiftRequestNotice } from "@/lib/shift/notify";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: "認証エラー" }, { status: 401 });
    }
  }

  const db = getDataStore();
  const targetMonth = addMonths(thisMonthJst(), 1);
  const rules = await db.getShiftRules();
  const message = noticeMessage(targetMonth, rules);
  const staffList = (await db.listStaff()).filter((s) => s.isActive);

  const result = await sendShiftRequestNotice(staffList, message);
  console.log(`[cron] シフト募集通知: ${result.notified}名へ送信（${result.channel}）`);
  return NextResponse.json({ ok: true, targetMonth, message, ...result });
}
