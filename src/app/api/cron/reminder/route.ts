// 予約のお知らせ（LINE）の定時実行。vercel.json に日本時間 8〜21時の毎時を1日1回ずつ登録してある。
// それぞれの回で、管理画面で選んだ「送る時刻」を過ぎた種類だけを送る（lib/line/appointment-notices.ts）：
//  ・3日前のお知らせ／前日の確認（／1週間前の案内）…… 対象日の予約に
//  ・予約完了のお知らせ …… 登録から48時間以内で、まだ届いていない分をもう一度
// 同じお知らせは、送信の記録（appointment_notice_logs）で二重に送らない。
// LINEのキーが未設定なら実際には送らない（モック。記録に「モック」と残る）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { env } from "@/lib/env";
import { settingsMap } from "@/lib/settings";
import {
  LINE_NOTICE_SETTINGS_KEY,
  jstHourFromSchedule,
  parseLineNoticeSettings,
  runScheduledNotices,
} from "@/lib/line/appointment-notices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 今の日本時間の時 */
function currentJstHour(): number {
  return (new Date().getUTCHours() + 9) % 24;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron は CRON_SECRET を設定すると Authorization: Bearer <CRON_SECRET> を自動付与する
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: "認証エラー" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("[cron] CRON_SECRET が未設定です。本番では必ず設定してください");
  }

  const db = getDataStore();
  const settings = parseLineNoticeSettings(settingsMap(await db.listAppSettings())[LINE_NOTICE_SETTINGS_KEY]);
  // どの時刻の回か（定時実行の式から。手で呼んだときは今の時刻）。
  // 動作確認用に ?hour=19 で指定できる（CRON_SECRET を設定しているときか、本番以外だけ）
  const hourParam = req.nextUrl.searchParams.get("hour");
  const asked = hourParam !== null && (Boolean(env.cronSecret) || process.env.NODE_ENV !== "production") ? Number(hourParam) : NaN;
  const slotHour = Number.isInteger(asked) && asked >= 0 && asked <= 23
    ? asked
    : (jstHourFromSchedule(req.headers.get("x-vercel-cron-schedule")) ?? currentJstHour());

  const summary = await runScheduledNotices(db, { today: todayJst(), slotHour, settings });
  console.log(
    `[cron] 予約のお知らせ（${slotHour}時の回）: ` +
      (summary.length === 0
        ? "この時刻に送る種類はありません"
        : summary.map((s) => `${s.kind} 対象${s.targets}件・送信${s.sent}・未連携${s.skipped}・失敗${s.failed}`).join(" / "))
  );
  return NextResponse.json({ ok: true, slotHour, summary });
}
