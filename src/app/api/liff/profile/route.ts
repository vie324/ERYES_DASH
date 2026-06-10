// LIFFフォームの初期表示用：LINEユーザーIDから顧客情報（氏名の自動入力値）を返す

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { resolveLineUserId } from "@/lib/line/liff-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { accessToken?: unknown; mockUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const lineUserId = await resolveLineUserId(body);
  if (!lineUserId) {
    return NextResponse.json({ ok: false, error: "LINEの認証に失敗しました" }, { status: 401 });
  }

  const customer = await getDataStore().getCustomerByLineUserId(lineUserId);
  return NextResponse.json({
    ok: true,
    registered: Boolean(customer),
    fullName: customer?.fullName ?? "",
  });
}
