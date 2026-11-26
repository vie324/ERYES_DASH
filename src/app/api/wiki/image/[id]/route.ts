// ENi Wikipedia の画像を出す。ログインした人だけ・そのページを見られる人だけ（URLを直接開いても見えない）。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { canSeePage } from "@/lib/wiki";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  if (!session) return new NextResponse("ログインしてください", { status: 401 });
  const { id } = await params;
  const img = await fx().wikiImages.get(id);
  if (!img) return new NextResponse("見つかりません", { status: 404 });
  if (img.pageId) {
    const page = await fx().wikiPages.get(img.pageId);
    const me = await getDataStore().getStaff(session.staffId);
    const v = { isAdmin: session.role === "admin", isExec: session.role === "admin" || session.role === "manager" || Boolean(me?.isExecutive) };
    if (!page || !canSeePage(page, v)) return new NextResponse("見つかりません", { status: 404 });
  }
  const m = img.dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new NextResponse("見つかりません", { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=3600" },
  });
}
