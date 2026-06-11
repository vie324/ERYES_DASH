// カウンセリング回答の受信（LIFFフォームから送信される）
// 顧客が未登録（友だち追加後に名前を送っていない）場合は、回答の氏名で顧客を自動作成する。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { validateAnswers } from "@/lib/counseling/validate";
import { resolveLineUserId } from "@/lib/line/liff-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { accessToken?: unknown; mockUserId?: unknown; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ["リクエスト形式が不正です"] }, { status: 400 });
  }

  const lineUserId = await resolveLineUserId(body);
  if (!lineUserId) {
    return NextResponse.json(
      { ok: false, errors: ["LINEの認証に失敗しました。LINEアプリから開き直してください"] },
      { status: 401 }
    );
  }

  const result = validateAnswers(body.answers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }

  const db = getDataStore();
  let customer = await db.getCustomerByLineUserId(lineUserId);
  if (!customer) {
    const fullName = String(result.answers.full_name ?? "").trim();
    customer = await db.createCustomer({ lineUserId, fullName: fullName || "（未登録）" });
  }

  await db.createCounselingResponse({ customerId: customer.id, answers: result.answers });
  return NextResponse.json({ ok: true });
}
