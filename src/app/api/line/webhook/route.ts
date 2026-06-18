// LINE Messaging API Webhook
// ・友だち追加（follow）→ あいさつメッセージに続けて、宛名付きで「フルネーム送信」を案内
// ・テキスト受信（message）→ 未登録ならフルネームとして顧客登録、登録済みなら案内を返信
// 氏名はチャットで受け取って登録し、続けてメニューの「カルテ入力」でカルテを記入してもらう。
//（「カルテ入力」から先に送信された場合も api/liff/counseling 側で顧客を自動作成する）
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
  "はじめにお客様の「フルネーム」（例：佐藤 花子）をこのトークに送信してください。\n" +
  "その後、下のメニューの「カルテ入力」を開いて、カルテ（カウンセリングシート）のご記入をお願いいたします。";

// フルネームとして読み取れなかった場合の再依頼
const MSG_ASK_AGAIN =
  "恐れ入ります、お名前をうまく読み取れませんでした。\n" +
  "お客様の「フルネーム」だけを送信してください。（例：佐藤 花子）";

// 氏名登録の完了後に「カルテ入力」へ案内
const MSG_REGISTERED = (name: string) =>
  `${name}様、ありがとうございます。お名前を登録いたしました。\n` +
  "続いて、下のメニューの「カルテ入力」を開いて、カルテ（カウンセリングシート）のご記入をお願いいたします。";

// 登録済みのお客様からのテキストへの定型案内
const MSG_GUIDE =
  "メッセージありがとうございます。\n" +
  "カルテのご記入は、下のメニューの「カルテ入力」からお願いいたします。\n" +
  "ご予約の変更・キャンセルは、お電話またはホットペッパービューティーより承っております。";

/** フルネームとして妥当かの簡易チェック（30文字以内・URLや改行を含まない） */
function looksLikeName(text: string): boolean {
  const t = text.trim();
  return t.length >= 1 && t.length <= 30 && !/https?:\/\//.test(t) && !t.includes("\n");
}

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
