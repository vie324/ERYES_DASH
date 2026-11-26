// 「見ないと消えない」お知らせ＋プッシュ通知をまとめて送る（依頼10〜23で共通）。
// アプリ内のお知らせ（app_notifications）は、本人が開くまでホームの帯・ヘッダーのベル・アイコンの赤い数字に残る。
// 開いたら既読（/staff/inbox/open を通すか、その画面で markAppNotificationsRead を呼ぶ）。
// どちらも失敗しても呼び元の操作は止めない。

import { notifyQuietly, pushPreview } from "@/lib/push/notify";
import type { PushKind } from "@/lib/push/kinds";
import type { DataStore } from "@/lib/data/types";

export async function notifyStaff(
  db: DataStore,
  staffIds: string[],
  n: {
    kind: PushKind;
    title: string;
    body: string;
    /** タップで開く画面（/staff/… か /admin/…） */
    href: string;
    /** 何についてのお知らせか（開いたら既読にするのに使う） */
    refId: string;
    /** アプリ内のお知らせを残すか（既定：残す） */
    inbox?: boolean;
    /** プッシュ通知を送るか（既定：送る） */
    push?: boolean;
    tag?: string;
  }
): Promise<void> {
  const targets = [...new Set(staffIds)].filter(Boolean);
  if (targets.length === 0) return;
  const body = pushPreview(n.body, 120);
  if (n.inbox !== false) {
    try {
      await db.createAppNotifications(
        targets.map((staffId) => ({ staffId, kind: n.kind, title: n.title, body, href: n.href, refId: n.refId }))
      );
    } catch (e) {
      console.error(`[notify] お知らせの保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (n.push !== false) {
    await notifyQuietly(db, targets, { title: n.title, body: pushPreview(n.body, 80), url: n.href, tag: n.tag, kind: n.kind });
  }
}

/** 幹部（店長・副店長）と管理者。storeId を渡すと、その店舗の幹部と管理者だけ */
export async function execsOf(db: DataStore, storeId?: string | null): Promise<string[]> {
  const staff = (await db.listStaff()).filter((s) => s.isActive);
  return staff
    .filter((s) => s.role === "admin" || (s.isExecutive && (!storeId || s.storeId === storeId)))
    .map((s) => s.id);
}

/** 管理者だけ */
export async function adminsOf(db: DataStore): Promise<string[]> {
  return (await db.listStaff()).filter((s) => s.isActive && s.role === "admin").map((s) => s.id);
}
