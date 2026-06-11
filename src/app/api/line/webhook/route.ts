// LINE Messaging API Webhook
// ・友だち追加（follow）→ フルネームの送信を促す自動返信
// ・テキスト受信（message）→ 未登録ならフルネームとして顧客登録、登録済みなら案内を返信
// LINE未接続（モックモード）では署名検証をスキップし、curl等で動作確認できる（README参照）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { replyText, verifyLineSignature } from "@/lib/line/client";

export const dynamic = "force-dynamic";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

const MSG_WELCOME =
  "友だち追加ありがとうございます🌸\n" +
  "はじめに、お客様の「フルネーム」をこのトークに送信してください。\n" +
  "（例：山田 花子）\n\n" +
  "ご登録後、メニューの「カウンセリング」からご来店前のご入力をお願いいたします。";

const MSG_ASK_AGAIN =
  "恐れ入ります、お名前をうまく読み取れませんでした🙇\n" +
  "お客様の「フルネーム」だけを送信してください。（例：山田 花子）";

const MSG_REGISTERED = (name: string) =>
  `${name} 様、ご登録ありがとうございます✨\n` +
  "メニューの「カウンセリング」を開いて、ご来店前のご入力をお願いいたします。\n" +
  "当日お会いできるのを楽しみにしております🌸";

const MSG_GUIDE =
  "メッセージありがとうございます🌸\n" +
  "カウンセリングのご入力はメニューの「カウンセリング」からお願いいたします。\n" +
  "ご予約の変更・キャンセルはお電話またはホットペッパービューティーからお願いいたします。";

/** フルネームとして妥当かの簡易チェック（30文字以内・URLや改行を含まない） */
function looksLikeName(text: string): boolean {
  const t = text.trim();
  return t.length >= 1 && t.length <= 30 && !/https?:\/\//.test(t) && !t.includes("\n");
}

async function handleEvent(event: LineEvent): Promise<void> {
  const db = getDataStore();
  const userId = event.source?.userId;

  if (event.type === "follow" && event.replyToken) {
    // 既存顧客の再追加（再フォロー）の場合は名前入力を求めない
    const existing = userId ? await db.getCustomerByLineUserId(userId) : null;
    await replyText(
      event.replyToken,
      existing ? MSG_REGISTERED(existing.fullName) : MSG_WELCOME
    );
    return;
  }

  if (event.type === "message" && event.message?.type === "text" && event.replyToken && userId) {
    const text = event.message.text ?? "";
    const existing = await db.getCustomerByLineUserId(userId);

    if (existing) {
      // TODO: 登録済み顧客からの全メッセージに定型文を返している。
      //       運用開始後にうるさいようなら自動応答をオフにする（このreplyを削除するだけ）。
      await replyText(event.replyToken, MSG_GUIDE);
      return;
    }

    if (!looksLikeName(text)) {
      await replyText(event.replyToken, MSG_ASK_AGAIN);
      return;
    }

    const customer = await db.createCustomer({ lineUserId: userId, fullName: text.trim() });
    await replyText(event.replyToken, MSG_REGISTERED(customer.fullName));
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
