// Web Push の購読の登録・解除（ログイン中のスタッフの端末として保存する）

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isPushConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

interface SubscriptionJson {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "未ログインです" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ ok: false, error: "通知は未設定です" }, { status: 400 });

  let body: { subscription?: SubscriptionJson; userAgent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const sub = body.subscription ?? {};
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub.keys?.auth === "string" ? sub.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "購読情報が不正です" }, { status: 400 });
  }

  await getDataStore().upsertPushSubscription({
    staffId: session.staffId,
    endpoint: endpoint.slice(0, 2000),
    p256dh,
    auth,
    userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 200) : "",
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "未ログインです" }, { status: 401 });
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です" }, { status: 400 });
  }
  if (typeof body.endpoint === "string" && body.endpoint) {
    await getDataStore().deletePushSubscription(body.endpoint);
  }
  return NextResponse.json({ ok: true });
}
