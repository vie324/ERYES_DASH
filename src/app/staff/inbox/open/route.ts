// お知らせを開く：その件のお知らせを既読にしてから、元の画面へ移る。
// 先に既読にしておくことで、移った先の画面のヘッダーのベル・ホームの数字がすぐに消える。
// 移る先はアプリの中の画面（/staff/・/admin/）だけ（外のサイトへは飛ばさない）。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { safeInboxTarget } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (ref) await getDataStore().markAppNotificationsRead(session.staffId, ref);
  return NextResponse.redirect(new URL(safeInboxTarget(req.nextUrl.searchParams.get("to")), req.url));
}
