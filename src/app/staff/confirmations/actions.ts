"use server";

// 依頼14：予定の「確認しました」。画面から届いた一覧のうち、サーバーで出し直した「確認が要るもの」だけを記録する
// （ほかの人の分・存在しない予定を、画面からの送りで確認済みにできないように）。

import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { acknowledge, pendingGateItems } from "@/lib/confirm-gate";

export async function ackGateAction(input: { itemType: string; itemId: string; version: string }[]): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  try {
    const pending = await pendingGateItems(getDataStore(), session.staffId);
    const wanted = new Set(input.map((i) => `${i.itemType}|${i.itemId}|${i.version}`));
    await acknowledge(
      session.staffId,
      pending.filter((p) => wanted.has(`${p.itemType}|${p.itemId}|${p.version}`))
    );
    return { ok: true };
  } catch (e) {
    console.error(`[gate] 確認の記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
    // 記録できなくても、画面を止めない（次に開いたときにもう一度出る）
    return { ok: true };
  }
}
