// 依頼20：カリキュラム動画の再生のURL（ログインしたスタッフにだけ、短い期限つきで出す）。
// 返すのは期限つきのURLだけ（動画そのものは配信サービスから届く）。見た記録（view_logs）も残す。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { playSourceFor } from "@/lib/video";
import { VIEW_TARGETS } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { id } = await params;
  const video = await fx().curriculumVideos.get(id);
  if (!video || !video.isActive) return NextResponse.json({ error: "動画が見つかりません" }, { status: 404 });
  try {
    const source = await playSourceFor(video);
    await getDataStore()
      .recordView({ targetType: VIEW_TARGETS.curriculumVideo, targetId: video.id, ownerStaffId: null, periodKey: "", viewerStaffId: session.staffId }, { dedupeMinutes: 30 })
      .catch(() => false);
    return NextResponse.json(source, { headers: { "cache-control": "no-store, private" } });
  } catch (e) {
    console.error(`[video] 再生のURLを作れませんでした: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "いまは再生できません。しばらくしてからもう一度お試しください" }, { status: 503 });
  }
}
