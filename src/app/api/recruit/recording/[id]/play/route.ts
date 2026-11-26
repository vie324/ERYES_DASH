// 依頼23：面接の録画の再生のURL（面接官と管理者だけ。期限つき）。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { accessTo } from "@/lib/recruit";
import { playSourceFor } from "@/lib/video";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { id } = await params;
  const f = fx();
  const rec = await f.interviewRecordings.get(id);
  if (!rec || rec.deletedAt || !rec.providerRef) return NextResponse.json({ error: "録画が見つかりません（保存期間を過ぎて消えた可能性があります）" }, { status: 404 });
  const applicant = await f.applicants.get(rec.applicantId);
  const me = await getDataStore().getStaff(session.staffId);
  const access = applicant ? await accessTo(me, applicant) : null;
  if (!access?.recordings) return NextResponse.json({ error: "この録画は見られません" }, { status: 403 });
  try {
    const source = await playSourceFor({ provider: rec.provider, providerRef: rec.providerRef, durationSec: 3600 });
    return NextResponse.json(source, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "いまは再生できません" }, { status: 503 });
  }
}
