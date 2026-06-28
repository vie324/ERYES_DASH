// カウンセリング回答の受信（LIFFフォームから送信される）
// 顧客が未登録（友だち追加後に名前を送っていない）場合は、回答の氏名で顧客を自動作成する。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { validateAnswers } from "@/lib/counseling/validate";
import { resolveLineUserId } from "@/lib/line/liff-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { accessToken?: unknown; mockUserId?: unknown; answers?: unknown; consent?: unknown };
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

  // 同意書（注意事項への同意・お名前・手書き署名）をサニタイズして回答に統合する。
  // validateAnswers は定義済み項目以外を除外するため、ここで consent_* キーとして付与する。
  const answers: Record<string, unknown> = { ...result.answers };
  const consent = (typeof body.consent === "object" && body.consent !== null ? body.consent : {}) as {
    name?: unknown;
    signature?: unknown;
    agreed?: unknown;
  };
  const consentName = typeof consent.name === "string" ? consent.name.trim().slice(0, 100) : "";
  const consentSig =
    typeof consent.signature === "string" && consent.signature.startsWith("data:image/")
      ? consent.signature.slice(0, 2_000_000) // 署名PNG（データURL）。上限約2MB
      : "";
  if (consentName) answers.consent_name = consentName;
  if (consentSig) answers.consent_signature = consentSig;
  if (consent.agreed === true) answers.consent_agreed = true;

  const db = getDataStore();
  let customer = await db.getCustomerByLineUserId(lineUserId);
  if (!customer) {
    const fullName = (consentName || String(result.answers.full_name ?? "")).trim();
    customer = await db.createCustomer({ lineUserId, fullName: fullName || "（未登録）" });
  }

  await db.createCounselingResponse({ customerId: customer.id, answers });
  return NextResponse.json({ ok: true });
}
