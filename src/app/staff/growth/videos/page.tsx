import Link from "next/link";
import { fx, tables } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { videoProgressFor } from "@/lib/growth";
import { PageHeader, EmptyState } from "@/components/ui";
import { NotReadyNotice, Note, TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

function durationLabel(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分${sec % 60 ? `${sec % 60}秒` : ""}`;
}

// 依頼20（75）：カリキュラムの動画（アプリの中だけで見られる）。どこまで見たかが出る。
export default async function GrowthVideosPage() {
  const v = await requireViewer();
  const [videos, progress, items] = await Promise.all([
    fx().curriculumVideos.list({ where: { isActive: true }, order: [["createdAt", "asc"]] }),
    videoProgressFor(v.staffId),
    fx().curriculumItems.list({ where: { isActive: true } }),
  ]);
  const ready = videos.filter((x) => x.status !== "error");
  return (
    <div className="page-narrow">
      <PageHeader title="カリキュラムの動画" backHref="/staff/growth" backLabel="ロードマップへ戻る" icon="play" />
      <NotReadyNotice table={tables.curriculumVideos} isAdmin={v.isAdmin} />
      <TabLinks
        items={[
          { href: "/staff/growth", label: "ロードマップ", active: false },
          { href: "/staff/growth/videos", label: "動画", active: true },
          ...(v.isExec || v.isStoreManager ? [{ href: "/staff/growth/team", label: "メンバー", active: false }] : []),
        ]}
      />
      <Note>動画はこのアプリの中だけで見られます（ダウンロード・保存はできません）。画面には見ている人の名前が薄く重なります。</Note>
      {ready.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="動画はまだ登録されていません" />
        </div>
      ) : (
        <ul className="space-y-2 mt-4">
          {ready.map((video) => {
            const p = progress.get(video.id);
            const usedBy = items.filter((i) => i.videoId === video.id).map((i) => i.title);
            return (
              <li key={video.id}>
                <Link href={`/staff/growth/videos/${video.id}`} className="card !p-3.5 flex items-center gap-3">
                  <span className="w-12 h-12 shrink-0 rounded-xl bg-ink-900 text-white grid place-items-center">
                    <Icon name="play" className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-ink-900 truncate">{video.title}</span>
                    <span className="block text-[11px] text-ink-500 truncate">
                      {video.status === "processing" ? "準備中（配信の処理をしています）" : durationLabel(video.durationSec)}
                      {usedBy.length ? `・${usedBy.join("・")}` : ""}
                    </span>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-ink-100 overflow-hidden">
                      <span className={`block h-full rounded-full ${p?.completed ? "bg-emerald-500" : "bg-brand-400"}`} style={{ width: `${p ? (p.completed ? 100 : p.pct) : 0}%` }} />
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-ink-500 w-14 text-right shrink-0">{p ? (p.completed ? "見終わり" : `${p.pct}%`) : "まだ"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
