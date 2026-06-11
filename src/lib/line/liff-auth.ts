// LIFFフォームからのリクエストでLINEユーザーIDを特定する。
// 本番（LINE設定済み）：LIFFのアクセストークンをLINEのAPIで検証して取得（なりすまし防止）。
// モック（LINE未設定）：テスト用IDをそのまま受け入れる（動作確認用）。

import { env } from "@/lib/env";
import { getLineUserIdFromAccessToken } from "@/lib/line/client";

export function isLiffMockMode(): boolean {
  return !env.lineChannelAccessToken && !env.lineChannelId;
}

export async function resolveLineUserId(body: {
  accessToken?: unknown;
  mockUserId?: unknown;
}): Promise<string | null> {
  if (isLiffMockMode()) {
    const mockId = typeof body.mockUserId === "string" ? body.mockUserId.trim() : "";
    return mockId ? mockId.slice(0, 100) : null;
  }
  if (typeof body.accessToken !== "string" || !body.accessToken) return null;
  return getLineUserIdFromAccessToken(body.accessToken);
}
