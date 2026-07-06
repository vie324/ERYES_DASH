// 予約リマインドの定時バッチ（毎日19:00 JSTにVercel Cronから実行される。vercel.json参照）
// ・前日リマインド：翌日に予約がある顧客へLINE Pushを送信（reminder_sent_at で二重送信防止）
// ・1週間前の事前案内：7日後に予約がある顧客へLINE Pushを送信（pre_reminder_sent_at で二重送信防止）
// どちらのメッセージにも、お客様ご自身で確認・変更・キャンセルできるページへのリンクを載せる。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateTimeJa, jstDayBoundsUtc, todayJst } from "@/lib/date";
import { pushText } from "@/lib/line/client";
import { env, isLineConfigured } from "@/lib/env";
import type { DataStore, NextAppointment } from "@/lib/data/types";

export const dynamic = "force-dynamic";

/** 予約確認ページへの案内文（LIFF未設定時はトークへの返信を案内） */
function selfServiceLines(): string {
  if (env.liffAppointmentId) {
    return (
      `▼ご予約の確認・変更・キャンセルはこちら\n` +
      `https://liff.line.me/${env.liffAppointmentId}`
    );
  }
  if (!isLineConfigured()) {
    // デモモード：直接URLで動作確認できるようにする
    return `▼ご予約の確認・変更・キャンセルはこちら\n${env.appUrl}/liff/appointment`;
  }
  return "※ご変更・キャンセルはこのトークにご返信ください。";
}

function buildReminderMessage(storeName: string, scheduledAt: Date, customerName: string): string {
  return (
    `【${storeName}】ご予約リマインド\n` +
    `${customerName} 様\n\n` +
    `明日 ${formatDateTimeJa(scheduledAt)} にご予約をいただいております。\n` +
    `お気をつけてお越しください。\n\n` +
    selfServiceLines()
  );
}

function buildPreReminderMessage(storeName: string, scheduledAt: Date, customerName: string): string {
  return (
    `【${storeName}】ご予約のご案内\n` +
    `${customerName} 様\n\n` +
    `1週間後の ${formatDateTimeJa(scheduledAt, true)} にご予約をいただいております。\n` +
    `ご都合が変わられた場合は、お早めにご変更・キャンセルをお願いいたします。\n\n` +
    selfServiceLines()
  );
}

/** 対象一覧に送信して既送フラグを立てる共通処理 */
async function sendBatch(
  db: DataStore,
  targets: NextAppointment[],
  buildMessage: (scheduledAt: Date, customerName: string) => string,
  mark: (id: string, at: Date) => Promise<void>
): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const appt of targets) {
    const customer = await db.getCustomer(appt.customerId);
    if (!customer?.lineUserId) {
      skipped++; // LINE未連携の顧客には送れない（電話等での案内を想定）
      continue;
    }
    const ok = await pushText(customer.lineUserId, buildMessage(appt.scheduledAt, customer.fullName));
    if (ok) {
      await mark(appt.id, new Date()); // 既送記録（次回バッチで対象外になり、二重送信を防ぐ）
      sent++;
    } else {
      failed++; // 失敗分は記録せず翌回のバッチで再試行される
    }
  }
  return { sent, skipped, failed };
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
  const today = todayJst();

  // 前日リマインド：翌日（JST）の予約
  const tomorrow = addDays(today, 1);
  const tb = jstDayBoundsUtc(tomorrow);
  const reminderTargets = await db.listAppointmentsNeedingReminder(tb.start, tb.end);
  const reminder = await sendBatch(
    db,
    reminderTargets,
    (at, name) => buildReminderMessage(store.name, at, name),
    (id, at) => db.markReminderSent(id, at)
  );

  // 1週間前の事前案内：7日後（JST）の予約
  const weekAhead = addDays(today, 7);
  const wb = jstDayBoundsUtc(weekAhead);
  const preTargets = await db.listAppointmentsNeedingPreReminder(wb.start, wb.end);
  const pre = await sendBatch(
    db,
    preTargets,
    (at, name) => buildPreReminderMessage(store.name, at, name),
    (id, at) => db.markPreReminderSent(id, at)
  );

  console.log(
    `[cron] 前日リマインド: ${reminder.sent}件送信 / ${reminder.skipped}件スキップ / ${reminder.failed}件失敗、` +
      `1週間前案内: ${pre.sent}件送信 / ${pre.skipped}件スキップ / ${pre.failed}件失敗`
  );
  return NextResponse.json({ ok: true, date: tomorrow, reminder, preReminder: pre });
}
