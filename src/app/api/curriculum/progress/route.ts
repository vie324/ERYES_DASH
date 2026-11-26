// 依頼20：動画をどこまで見たか（再生中に10秒ごと・止めたとき・見終わったときに届く）。いちばん先まで見た位置を残す。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fx } from "@/lib/data/tables";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  let body: { videoId?: unknown; position?: unknown; duration?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "形式が正しくありません" }, { status: 400 });
  }
  const videoId = typeof body.videoId === "string" ? body.videoId : "";
  const position = Math.max(0, Math.round(Number(body.position) || 0));
  const duration = Math.max(0, Math.round(Number(body.duration) || 0));
  const f = fx();
  const video = videoId ? await f.curriculumVideos.get(videoId) : null;
  if (!video) return NextResponse.json({ error: "動画が見つかりません" }, { status: 404 });
  try {
    const existing = await f.videoProgress.find({ staffId: session.staffId, videoId });
    const dur = duration || video.durationSec || existing?.durationSec || 0;
    const maxPos = Math.min(dur || position, Math.max(existing?.maxPositionSec ?? 0, position));
    const completed = Boolean(existing?.completed) || (dur > 0 && maxPos >= dur * 0.9);
    if (existing) await f.videoProgress.update(existing.id, { maxPositionSec: maxPos, durationSec: dur, completed, lastWatchedAt: new Date() });
    else await f.videoProgress.insert({ staffId: session.staffId, videoId, maxPositionSec: maxPos, durationSec: dur, completed, lastWatchedAt: new Date() });
    if (!video.durationSec && dur) await f.curriculumVideos.update(video.id, { durationSec: dur });
    return NextResponse.json({ ok: true, completed });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
