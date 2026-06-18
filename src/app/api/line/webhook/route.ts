// LINE Messaging API Webhook
// ・友だち追加（follow）→ あいさつメッセージに続けて、宛名付きで「カルテ入力」への案内を返信
// ・テキスト受信（message）→ 「カルテ入力」へ誘導する案内を返信
// 顧客登録は、お客様がメニューの「カルテ入力」からカルテを送信した時点で自動的に行われる
// （氏名はカルテのお名前欄で取得するため、チャットでの氏名送信は不要）。
// LINE未接続（モックモード）では署名検証をスキップし、curl等で動作確認できる（README参照）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { getProfileName, replyText, verifyLineSignature } from "@/lib/line/client";

export const dynamic = "force-dynamic";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

// 友だち追加直後の応答（LINEの「あいさつメッセージ」のすぐ下に届く）。
// お客様はご来店後に友だち追加されるため、「来店前」「事前に」等の表現は使わない。
const MSG_WELCOME = (name?: string) =>
  (name ? `${name}様\n` : "") +
  "ご登録ありがとうございます。\n" +
  "下のメニューの「カルテ入力」を開いて、カルテ（カウンセリングシート）のご記入をお願いいたします。\n" +
  "ご来店時に、お手隙のタイミングでご入力いただけますと幸いです。";

// テキストメッセージへの定型案内
const MSG_GUIDE =
  "メッセージありがとうございます。\n" +
  "カルテのご記入は、下のメニューの「カルテ入力」からお願いいたします。\n" +
  "ご予約の変更・キャンセルは、お電話またはホットペッパービューティーより承っております。";

async function handleEvent(event: LineEvent): Promise<void> {
  const db = getDataStore();
  const userId = event.source?.userId;

  if (event.type === "follow" && event.replyToken) {
    // 宛名：登録済みのお客様はカルテのお名前、新規はLINEの表示名（取得できなければ宛名なし）
    const existing = userId ? await db.getCustomerByLineUserId(userId) : null;
    const name =
      existing?.fullName || (userId ? await getProfileName(userId) : null) || undefined;
    await replyText(event.replyToken, MSG_WELCOME(name));
    return;
  }

  if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
    // 氏名はメニューの「カルテ入力」で登録するため、ここでは案内のみを返す。
    await replyText(event.replyToken, MSG_GUIDE);
    return;
  }

  // unfollow（ブロック）等は顧客レコードを残したまま何もしない
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!(await verifyLineSignature(rawBody, signature))) {
    return NextResponse.json({ error: "署名が不正です" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    const body = JSON.parse(rawBody) as { events?: LineEvent[] };
    events = body.events ?? [];
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  // LINEプラットフォームへは素早く200を返す必要があるが、
  // イベント数は少ないため順次処理で問題ない（タイムアウト時はLINE側が再送する）
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (e) {
      console.error("[LINE webhook] イベント処理に失敗:", e);
    }
  }

  return NextResponse.json({ ok: true });
}

/** LINE Developersの「検証」ボタンや疎通確認用 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "LINE webhook" });
}
