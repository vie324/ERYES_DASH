// 依頼22：データの削除のお願い（Data deletion request callback）。そのアカウントの数字・投稿の記録・トークンを消す。
// GET ?code= は、削除が済んだかを確かめる画面（Metaの決まりで、確認の番号とURLを返す）。

import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { fx } from "@/lib/data/tables";
import { parseSignedRequest } from "@/lib/instagram/signed-request";
import { publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const form = new URLSearchParams(await req.text());
  const data = parseSignedRequest(form.get("signed_request") ?? "");
  if (!data?.user_id) return new Response("bad request", { status: 400 });
  const f = fx();
  const acc = await f.instagramAccounts.find({ igUserId: data.user_id });
  if (acc) {
    await f.instagramDaily.removeWhere({ accountId: acc.id });
    await f.instagramMedia.removeWhere({ accountId: acc.id });
    await f.instagramAccounts.remove(acc.id);
  }
  const code = randomBytes(8).toString("hex");
  return Response.json({ url: `${publicOrigin(req)}/api/instagram/data-deletion?code=${code}`, confirmation_code: code });
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  return new Response(`ENiスタッフアプリ：Instagramのデータの削除を受け付け、削除しました（確認の番号：${code.replace(/[^a-f0-9]/g, "").slice(0, 16)}）。`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
