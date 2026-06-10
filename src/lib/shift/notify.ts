// シフト希望募集の通知インターフェース。
// TODO: 通知チャネルが未確定のため現状はログ出力のモック。
//       チャネル決定後（LINE公式のスタッフ向けPush／メール等）はこの関数の中身を
//       差し替えるだけでよい。接続手順は README の「シフト募集通知」を参照。
//       なお、通知とは別にログイン時バナー（ShiftNoticeBanner）が常に機能するため、
//       チャネル未接続でも運用は回る。

import type { Staff } from "@/lib/data/types";

export interface NoticeResult {
  notified: number;
  channel: "mock" | "line" | "email";
}

export async function sendShiftRequestNotice(
  staffList: Staff[],
  message: string
): Promise<NoticeResult> {
  for (const staff of staffList) {
    console.log(`[シフト通知モック] ${staff.name} さんへ: ${message}`);
  }
  return { notified: staffList.length, channel: "mock" };
}
