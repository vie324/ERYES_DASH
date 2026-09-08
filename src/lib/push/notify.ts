// Web Push（スマホ・PCへの通知とアプリアイコンのバッジ）の送信。
// トークの新着・メンション・アナウンス・タスクの依頼・サンクスカードなどで呼ぶ。
// 送信は失敗しても業務の操作を止めないように、例外は握りつぶしてログだけ残す。
// VAPID鍵（環境変数）が未設定なら何もしない。

import webpush from "web-push";
import { env, isPushConfigured } from "@/lib/env";
import type { DataStore } from "@/lib/data/types";

export interface PushPayload {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内のパス） */
  url: string;
  /** 同じ tag の通知は置き換える（トークルームごと等。連投で溢れないように） */
  tag?: string;
  /** アプリアイコンに出す件数（省略時は「点」だけ付く） */
  badge?: number;
}

let configured = false;
function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    // subject は連絡先（mailto: か https:）。未設定ならアプリのURLを使う
    const subject = env.vapidSubject || env.appUrl;
    webpush.setVapidDetails(subject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
  return true;
}

/**
 * 指定したスタッフの全端末へ通知を送る。
 * 失効した購読（404/410）はその場で削除する。
 */
export async function sendPush(
  db: DataStore,
  staffIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const targets = [...new Set(staffIds)].filter(Boolean);
  if (targets.length === 0 || !ensureVapid()) return { sent: 0, failed: 0 };

  let subs;
  try {
    subs = await db.listPushSubscriptions(targets);
  } catch (e) {
    console.error(`[push] 購読の取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
    return { sent: 0, failed: 0 };
  }
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 12, timeout: 8000 }
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // 端末側で購読が解除されている → 消しておく
          await db.deletePushSubscription(sub.endpoint).catch(() => {});
        } else {
          console.error(`[push] 送信失敗 (${status ?? "?"})`);
        }
      }
    })
  );
  return { sent, failed };
}

/** 業務の操作から呼ぶ用：失敗しても呼び元を止めない */
export async function notifyQuietly(db: DataStore, staffIds: string[], payload: PushPayload): Promise<void> {
  try {
    await sendPush(db, staffIds, payload);
  } catch (e) {
    console.error(`[push] ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 本文の短縮（通知の1行に収める） */
export function pushPreview(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 「山本 大輝」→「山本」 */
export function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
