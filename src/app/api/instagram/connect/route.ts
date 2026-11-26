// 依頼22：本人が自分のInstagramをつなぐ入口。Instagramの許可の画面へ送る（戻り先は /api/instagram/callback）。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { authorizeUrl, isInstagramConfigured, makeState } from "@/lib/instagram";
import { publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (!isInstagramConfigured()) return NextResponse.redirect(new URL("/staff/instagram?error=" + encodeURIComponent("Instagramの連携の準備がまだです（管理者に連絡してください）"), req.url));
  const redirectUri = `${publicOrigin(req)}/api/instagram/callback`;
  return NextResponse.redirect(authorizeUrl(redirectUri, makeState(session.staffId)));
}
