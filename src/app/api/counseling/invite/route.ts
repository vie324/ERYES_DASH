// 来店前カウンセリング（SMSの案内URL経由）の回答受信。
// LINE連携を使わず、案内発行時のトークンで本人を識別する。
// 回答時に顧客を自動作成し、案内→顧客→回答を紐づける（二重回答は不可）。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { validateAnswers } from "@/lib/counseling/validate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { token?: unknown; answers?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ["リクエスト形式が不正です"] }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const db = getDataStore();
  const invite = token ? await db.getCounselingInviteByToken(token) : null;
  if (!invite) {
    return NextResponse.json(
      { ok: false, errors: ["このURLは無効です。お店にお問い合わせください"] },
      { status: 404 }
    );
  }
  if (invite.answeredAt) {
    return NextResponse.json(
      { ok: false, errors: ["このカウンセリングは回答済みです。変更はお店にご連絡ください"] },
      { status: 409 }
    );
  }

  const result = validateAnswers(body.answers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }

  // 注意事項への同意（「確認しました」チェック）を回答に統合する
  const answers: Record<string, unknown> = { ...result.answers };
  const consent = (typeof body.consent === "object" && body.consent !== null ? body.consent : {}) as {
    agreed?: unknown;
  };
  if (consent.agreed === true) answers.consent_agreed = true;

  // LINE未連携の顧客として作成（お名前は回答優先・無ければ案内発行時の名前）
  const fullName =
    String(result.answers.full_name ?? "").trim() || invite.customerName || "（未登録）";
  const customer = await db.createCustomer({ lineUserId: null, fullName });
  const response = await db.createCounselingResponse({ customerId: customer.id, answers });
  await db.markCounselingInviteAnswered(invite.id, customer.id, response.id);

  return NextResponse.json({ ok: true });
}
