// LINE Messaging API クライアント。
// LINE_CHANNEL_ACCESS_TOKEN 未設定時は「モックモード」：実際には送信せず、
// コンソールと送信ログ（画面で確認可能）に記録する。本番接続手順は README を参照。

import { env, isLineConfigured } from "@/lib/env";

const LINE_API = "https://api.line.me/v2/bot";

export interface MockSendLog {
  type: "reply" | "push" | "multicast";
  to: string; // 宛先（replyTokenまたはuserId、multicastは件数表記）
  text: string;
  at: Date;
}

// モック送信ログ（デモモードでの動作確認用。メモリ内のみ）
const globalForLine = globalThis as unknown as { __eryesLineLog?: MockSendLog[] };
function mockLog(): MockSendLog[] {
  if (!globalForLine.__eryesLineLog) globalForLine.__eryesLineLog = [];
  return globalForLine.__eryesLineLog;
}

export function getMockSendLogs(): MockSendLog[] {
  return [...mockLog()].reverse();
}

export function lineMode(): "live" | "mock" {
  return isLineConfigured() ? "live" : "mock";
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.lineChannelAccessToken}`,
  };
}

/** 応答メッセージ（WebhookのreplyToken宛て。Push通数は消費しない） */
export async function replyText(replyToken: string, text: string): Promise<void> {
  if (!isLineConfigured()) {
    console.log(`[LINEモック] reply -> ${replyToken}: ${text}`);
    mockLog().push({ type: "reply", to: replyToken, text, at: new Date() });
    return;
  }
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    console.error(`[LINE] reply失敗: ${res.status} ${await res.text()}`);
  }
}

/** Pushメッセージ（1ユーザー宛て）。成功したら true */
export async function pushText(lineUserId: string, text: string): Promise<boolean> {
  if (!isLineConfigured()) {
    console.log(`[LINEモック] push -> ${lineUserId}: ${text}`);
    mockLog().push({ type: "push", to: lineUserId, text, at: new Date() });
    return true;
  }
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    console.error(`[LINE] push失敗(${lineUserId}): ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

/** 複数ユーザーへの一斉Push（500人ずつに分割して送信）。送信できた人数を返す */
export async function multicastText(lineUserIds: string[], text: string): Promise<number> {
  if (lineUserIds.length === 0) return 0;
  if (!isLineConfigured()) {
    console.log(`[LINEモック] multicast -> ${lineUserIds.length}名: ${text}`);
    mockLog().push({ type: "multicast", to: `${lineUserIds.length}名`, text, at: new Date() });
    return lineUserIds.length;
  }
  let sent = 0;
  for (let i = 0; i < lineUserIds.length; i += 500) {
    const chunk = lineUserIds.slice(i, i + 500);
    const res = await fetch(`${LINE_API}/message/multicast`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ to: chunk, messages: [{ type: "text", text }] }),
    });
    if (res.ok) {
      sent += chunk.length;
    } else {
      console.error(`[LINE] multicast失敗: ${res.status} ${await res.text()}`);
    }
  }
  return sent;
}

/** Webhook署名検証（X-Line-Signature）。モックモード時は検証をスキップ */
export async function verifyLineSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!env.lineChannelSecret) return true; // モックモード（curl等での動作確認用）
  if (!signature) return false;
  const { createHmac } = await import("crypto");
  const expected = createHmac("sha256", env.lineChannelSecret).update(rawBody).digest("base64");
  return expected === signature;
}

/** 友だちの表示名（ニックネーム）を取得。失敗時・モックモード時は null */
export async function getProfileName(lineUserId: string): Promise<string | null> {
  if (!isLineConfigured()) return null;
  try {
    const res = await fetch(`${LINE_API}/profile/${encodeURIComponent(lineUserId)}`, {
      headers: { Authorization: `Bearer ${env.lineChannelAccessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    const name = (data.displayName ?? "").trim();
    return name || null;
  } catch {
    return null;
  }
}

/** LIFFのアクセストークンを検証してLINEユーザーIDを取得（本番モード用） */
export async function getLineUserIdFromAccessToken(accessToken: string): Promise<string | null> {
  try {
    // 1. トークンの有効性とチャネル一致を確認
    const verifyRes = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!verifyRes.ok) return null;
    const verify = (await verifyRes.json()) as { client_id?: string; expires_in?: number };
    // LIFFのアクセストークンは「LINEログインチャネル」が発行するため、その client_id は
    // LIFF ID の先頭（ハイフン前）＝ログインチャネルID。Messaging APIのチャネルIDとは別物。
    // LIFF ID から期待値を導き、未設定時のみ Messaging API のチャネルIDにフォールバックする。
    const expectedChannelId = env.liffId ? env.liffId.split("-")[0] : env.lineChannelId;
    if (expectedChannelId && verify.client_id !== expectedChannelId) return null;
    if ((verify.expires_in ?? 0) <= 0) return null;

    // 2. プロフィールからuserIdを取得
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) return null;
    const profile = (await profileRes.json()) as { userId?: string };
    return profile.userId ?? null;
  } catch {
    return null;
  }
}
