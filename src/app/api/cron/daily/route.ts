// 依頼10〜23の定時実行。vercel.json に日本時間 3・5・7・9・10・12・19・20・21時の1日1回ずつを登録してある。
// その回で「やる時刻を過ぎた仕事」だけを行い、同じ仕事は同じ日（月）に1回だけ（lib/jobs）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { env } from "@/lib/env";
import { jstHourFromSchedule } from "@/lib/line/appointment-notices";
import { JOBS } from "@/lib/jobs";
import { runJobs } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron は CRON_SECRET を設定すると Authorization: Bearer <CRON_SECRET> を自動で付ける
  if (env.cronSecret) {
    if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.warn("[cron] CRON_SECRET が未設定です。本番では必ず設定してください");
  }
  // 動作確認用に ?hour=19 で回を指定できる（CRON_SECRET を設定しているときか、本番以外だけ）
  const hourParam = req.nextUrl.searchParams.get("hour");
  const asked = hourParam !== null && (Boolean(env.cronSecret) || process.env.NODE_ENV !== "production") ? Number(hourParam) : NaN;
  const slotHour =
    Number.isInteger(asked) && asked >= 0 && asked <= 23 ? asked : (jstHourFromSchedule(req.headers.get("x-vercel-cron-schedule")) ?? (new Date().getUTCHours() + 9) % 24);
  const outcomes = await runJobs(JOBS, { db: getDataStore(), now: new Date(), today: todayJst(), slotHour, force: false });
  const done = outcomes.filter((o) => o.status !== "skipped");
  console.log(`[cron] 定時の仕事（${slotHour}時の回）: ${done.length === 0 ? "この回にやる仕事はありません" : done.map((o) => `${o.label}=${o.status}:${o.detail}`).join(" / ")}`);
  return NextResponse.json({ ok: true, slotHour, outcomes });
}
