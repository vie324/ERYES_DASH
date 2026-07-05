// お客様ご自身の次回予約一覧（LIFF予約確認ページから呼ばれる）

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
    return NextResponse.json(
      { ok: false, error: "LINEの認証に失敗しました。LINEアプリから開き直してください" },
      { status: 401 }
    );
  }

  const db = getDataStore();
  const customer = await db.getCustomerByLineUserId(lineUserId);
  if (!customer) {
    return NextResponse.json({ ok: true, fullName: "", appointments: [] });
  }

  const [appointments, staffList] = await Promise.all([
    db.listNextAppointments({ customerId: customer.id, from: new Date() }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  return NextResponse.json({
    ok: true,
    fullName: customer.fullName,
    appointments: appointments.map((a) => ({
      id: a.id,
      scheduledAt: a.scheduledAt.toISOString(),
      staffName: a.staffId ? (staffMap.get(a.staffId) ?? "") : "",
      status: a.status,
      requestedNewAt: a.requestedNewAt ? a.requestedNewAt.toISOString() : null,
    })),
  });
}
