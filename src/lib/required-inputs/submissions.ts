// 入力した日時の記録（依頼14：インセンティブは「締め日までに入力・確認されたもの」だけを使うため）。
// 日報・週報・レジ締め・打刻などを保存したときに呼ぶ。はじめて入れた日時は変えず、最後に直した日時だけ進める。
// 記録できなくても（DBの準備前など）、保存そのものは止めない。

import { fx } from "@/lib/data/tables";

export async function recordSubmission(staffId: string, inputKey: string, date: string): Promise<void> {
  try {
    const f = fx();
    const now = new Date();
    const existing = await f.inputSubmissions.find({ staffId, inputKey, date });
    if (existing) await f.inputSubmissions.update(existing.id, { lastSubmittedAt: now });
    else await f.inputSubmissions.insert({ staffId, inputKey, date, firstSubmittedAt: now, lastSubmittedAt: now });
  } catch (e) {
    console.error(`[submissions] 入力の記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}
