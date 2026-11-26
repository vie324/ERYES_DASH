import { notFound } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { PageHeader } from "@/components/ui";
import { Note } from "@/components/feature-ui";
import { ProtectedPlayer } from "@/components/video/protected-player";

export const dynamic = "force-dynamic";

// 依頼20（75）：動画を見る画面。再生のURLは、ここから期限つきで受け取る（/api/curriculum/video/[id]/play）。
// 幹部には、担当メンバーがこの動画をどこまで見たかも出す。
export default async function WatchVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const f = fx();
  const video = await f.curriculumVideos.get(id);
  if (!video || !video.isActive) notFound();
  const mine = await f.videoProgress.find({ staffId: v.staffId, videoId: video.id });
  const startAt = mine && !mine.completed ? mine.maxPositionSec : 0;
  let team: { name: string; pct: number; completed: boolean }[] = [];
  if (v.isExec || v.isStoreManager) {
    const db = getDataStore();
    const [staff, rows] = await Promise.all([db.listStaff(), f.videoProgress.list({ where: { videoId: video.id } })]);
    team = staff
      .filter((s) => s.isActive && s.role !== "admin" && s.id !== v.staffId && canSeeMember(v, s))
      .map((s) => {
        const r = rows.find((x) => x.staffId === s.id);
        const dur = r?.durationSec || video.durationSec;
        return { name: s.name, pct: r && dur ? Math.min(100, Math.round((r.maxPositionSec / dur) * 100)) : 0, completed: Boolean(r?.completed) };
      })
      .sort((a, b) => b.pct - a.pct);
  }
  return (
    <div className="page-narrow">
      <PageHeader title={video.title} backHref="/staff/growth/videos" backLabel="動画の一覧へ戻る" icon="play" />
      {video.status === "processing" ? (
        <Note tone="warn">配信の準備をしています。数分たってから開き直してください。</Note>
      ) : (
        <ProtectedPlayer videoId={video.id} viewerName={v.me?.name ?? "スタッフ"} startAt={startAt} />
      )}
      {video.description && <p className="text-sm text-ink-700 mt-4 whitespace-pre-wrap leading-relaxed">{video.description}</p>}
      <p className="text-[11px] text-ink-400 mt-3">社内限定の動画です。画面の撮影・録画や、人に見せることはしないでください。</p>
      {team.length > 0 && (
        <section className="card !p-3.5 mt-5">
          <p className="text-[11px] font-bold text-ink-500 mb-2">担当メンバーの視聴</p>
          <ul className="space-y-1.5">
            {team.map((t) => (
              <li key={t.name} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-ink-800">{t.name}</span>
                <span className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                  <span className={`block h-full rounded-full ${t.completed ? "bg-emerald-500" : "bg-brand-400"}`} style={{ width: `${t.completed ? 100 : t.pct}%` }} />
                </span>
                <span className="w-14 text-right text-ink-500">{t.completed ? "見終わり" : `${t.pct}%`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
