// 依頼22：本人がInstagramの設定でこのアプリとのつながりを外したときに、Metaから届く知らせ（Deauthorize callback）。

import { NextRequest } from "next/server";
import { fx } from "@/lib/data/tables";
import { parseSignedRequest } from "@/lib/instagram/signed-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const form = new URLSearchParams(await req.text());
  const data = parseSignedRequest(form.get("signed_request") ?? "");
  if (!data?.user_id) return new Response("bad request", { status: 400 });
  const f = fx();
  const acc = await f.instagramAccounts.find({ igUserId: data.user_id });
  if (acc) await f.instagramAccounts.update(acc.id, { status: "disconnected", tokenEnc: "", lastError: "Instagramの設定でつながりが外されました" });
  return new Response("ok");
}
