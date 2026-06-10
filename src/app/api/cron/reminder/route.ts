// 前日リマインドの定時バッチ（毎日19:00 JSTにVercel Cronから実行される。vercel.json参照）
// 翌日に予約がある顧客へLINE Pushを送信し、reminder_sent_at を記録して二重送信を防ぐ。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateTimeJa, jstDayBoundsUtc, todayJst } from "@/lib/date";
import { pushText } from "@/lib/line/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function buildReminderMessage(storeName: string, scheduledAt: Date, customerName: string): string {
  return (
    `【${storeName}】ご予約リマインド🌸\n` +
    `${customerName} 様\n\n` +
    `明日 ${formatDateTimeJa(scheduledAt)} にご予約をいただいております。\n` +
    `お気をつけてお越しください。\n\n` +
    `※ご変更・キャンセルはお早めにご連絡をお願いいたします。`
  );
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
  const store = await db.getStore();

  // 翌日（JST）の0:00〜24:00に予約があり、まだリマインドを送っていないもの
  const tomorrow = addDays(todayJst(), 1);
  const { start, end } = jstDayBoundsUtc(tomorrow);
  const targets = await db.listAppointmentsNeedingReminder(start, end);

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const appt of targets) {
    const customer = await db.getCustomer(appt.customerId);
    if (!customer?.lineUserId) {
      skipped++; // LINE未連携の顧客には送れない（電話等での案内を想定）
      continue;
    }
    const ok = await pushText(
      customer.lineUserId,
      buildReminderMessage(store.name, appt.scheduledAt, customer.fullName)
    );
    if (ok) {
      // 送信日時を記録（次回バッチで対象外になり、二重送信を防ぐ）
      await db.markReminderSent(appt.id, new Date());
      sent++;
    } else {
      // 失敗分は記録せず翌回のバッチで再試行される（予約前日を過ぎたら対象外）
      failures.push(appt.id);
    }
  }

  console.log(`[cron] リマインド送信: ${sent}件送信 / ${skipped}件スキップ / ${failures.length}件失敗`);
  return NextResponse.json({ ok: true, date: tomorrow, sent, skipped, failed: failures.length });
}
