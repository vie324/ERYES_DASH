// お客様ご自身による次回予約の操作（確認・変更希望・キャンセル）
// なりすまし防止のため、予約の持ち主のLINEユーザーIDと一致する場合のみ操作できる。

import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data";
import { jstLocalToUtc } from "@/lib/date";
import { resolveLineUserId } from "@/lib/line/liff-auth";

export const dynamic = "force-dynamic";

type Action = "confirm" | "request_change" | "cancel";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    accessToken?: unknown;
    mockUserId?: unknown;
    id?: unknown;
    action?: unknown;
    newAt?: unknown; // "YYYY-MM-DDTHH:mm"（JST）変更希望日時
    note?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const lineUserId = await resolveLineUserId(body);
  if (!lineUserId) {
    return NextResponse.json(
      { ok: false, error: "LINEの認証に失敗しました。LINEアプリから開き直してください" },
      { status: 401 }
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action as Action;
  if (!id || !["confirm", "request_change", "cancel"].includes(action)) {
    return NextResponse.json({ ok: false, error: "操作内容が不正です" }, { status: 400 });
  }

  const db = getDataStore();
  const appointment = await db.getNextAppointment(id);
  if (!appointment) {
    return NextResponse.json({ ok: false, error: "ご予約が見つかりませんでした" }, { status: 404 });
  }
  // 持ち主チェック
  const customer = await db.getCustomer(appointment.customerId);
  if (!customer || customer.lineUserId !== lineUserId) {
    return NextResponse.json({ ok: false, error: "このご予約は操作できません" }, { status: 403 });
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "キャンセル済みのご予約です" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (action === "confirm") {
    await db.updateNextAppointment(id, { status: "confirmed" });
    return NextResponse.json({ ok: true, message: "ご予約を確認しました。ご来店をお待ちしております。" });
  }

  if (action === "request_change") {
    const newAtStr = typeof body.newAt === "string" ? body.newAt : "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(newAtStr)) {
      return NextResponse.json({ ok: false, error: "ご希望の日時を選択してください" }, { status: 400 });
    }
    const newAt = jstLocalToUtc(newAtStr);
    if (newAt.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "過去の日時は選択できません" }, { status: 400 });
    }
    await db.updateNextAppointment(id, {
      status: "change_requested",
      requestedNewAt: newAt,
      changeNote: note,
    });
    return NextResponse.json({
      ok: true,
      message: "変更のご希望を承りました。サロンで確認のうえ、確定後にLINEでお知らせいたします。",
    });
  }

  // cancel
  await db.updateNextAppointment(id, { status: "cancelled", changeNote: note });
  return NextResponse.json({
    ok: true,
    message: "ご予約のキャンセルを承りました。またのご利用をお待ちしております。",
  });
}
