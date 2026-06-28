// LINE Messaging API Webhook
// ・友だち追加（follow）→ フルネーム送信を促すあいさつを返信
//   （公式アカウントの「あいさつメッセージ」はオフ運用のため、これが友だち追加時の1通目）
// ・テキスト受信（message）→ 未登録ならフルネームとして顧客登録、登録済みなら案内を返信
// 氏名はチャットで受け取って登録し、続けてメニューの「カルテ入力」でカルテを記入してもらう。
//（「カルテ入力」から先に送信された場合も api/liff/counseling 側で顧客を自動作成する）
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

// 友だち追加時に最初に届くあいさつ（公式アカウントの「あいさつメッセージ」はオフ運用）。
const MSG_WELCOME =
  "友だち追加ありがとうございます🌸\n" +
  "はじめに、お客様の「フルネーム」をこのトークに送信してください。\n" +
  "（例：山田 花子）\n" +
  "\n" +
  "ご登録後、下記の「カルテ入力」をしていただく流れとなります。";

// フルネームとして読み取れなかった場合の再依頼
const MSG_ASK_AGAIN =
  "恐れ入ります、お名前をうまく読み取れませんでした。\n" +
  "お客様の「フルネーム」だけを送信してください。（例：山田 花子）";

// 氏名登録の完了後に「カルテ入力」へ案内
const MSG_REGISTERED = (name: string) =>
  `${name}様、ありがとうございます。\n` +
  "お名前を登録いたしました☺️\n" +
  "\n" +
  "続いて、下記の「カルテ入力」を開いて、カルテ（カウンセリングシート）のご記入をお願いいたします。\n" +
  "\n" +
  `${name}様にとって最適な施術をしていくために最初にご記載いただいております。\n` +
  "お手数おかけしますが、どうぞよろしくお願い致します。";

// 登録済みのお客様からのテキストへの自動応答（応答メッセージ）
const MSG_GUIDE =
  "ご連絡いただき誠にありがとうございます。\n" +
  "\n" +
  "※こちら自動メッセージのため、内容問わず送らせていただいております。\n" +
  "\n" +
  "内容確認後、担当スタッフからご返信させていただきます。お時間いただきますがどうぞよろしくお願い致します。\n" +
  "\n" +
  "※緊急の場合等はこちら店舗へ、アイサロンについてと一言お伝えいただき、ご用件をお話し下さいませ。\n" +
  "店舗TEL 03-5726-9777";

/** フルネームとして妥当かの簡易チェック（30文字以内・URLや改行を含まない） */
function looksLikeName(text: string): boolean {
  const t = text.trim();
  return t.length >= 1 && t.length <= 30 && !/https?:\/\//.test(t) && !t.includes("\n");
}

async function handleEvent(event: LineEvent): Promise<void> {
  const db = getDataStore();
  const userId = event.source?.userId;

  if (event.type === "follow" && event.replyToken) {
    await replyText(event.replyToken, MSG_WELCOME);
    return;
  }

  if (event.type === "message" && event.message?.type === "text" && event.replyToken && userId) {
    const text = event.message.text ?? "";
    const existing = await db.getCustomerByLineUserId(userId);

    // 登録済みのお客様には案内のみ（氏名は再登録しない）
    if (existing) {
      await replyText(event.replyToken, MSG_GUIDE);
      return;
    }

    // 未登録：送られたテキストをフルネームとして登録し、「カルテ入力」へ案内
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
