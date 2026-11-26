import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { uploadProvider } from "@/lib/video";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { VideoUpload } from "@/components/video/video-upload";
import {
  refreshVideoAction,
  registerVideoUrlAction,
  saveItemAction,
  saveJoinedDatesAction,
  saveStageAction,
  saveVideoAction,
} from "./actions";

export const dynamic = "force-dynamic";

const JOB_TYPES: [string, string][] = [
  ["", "全員"],
  ["stylist", "スタイリスト"],
  ["assistant", "アシスタント"],
  ["eyes", "イーリス"],
];

const PROVIDER_LABEL: Record<string, string> = { cloudflare: "Cloudflare Stream", supabase: "Supabase（非公開）", url: "URL（試し用・保護なし）" };

// 依頼20：成長ロードマップの中身（ENiの資料から入れる）。段階（コンピテンシー）・カリキュラムの項目・動画・入社日。
export default async function AdminGrowthPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const tab = ["stages", "items", "videos", "joined"].includes(params.tab ?? "") ? params.tab! : "stages";
  const f = fx();
  const db = getDataStore();
  const [stages, items, videos, staff, profiles, stores] = await Promise.all([
    f.growthStages.list({ order: [["sortOrder", "asc"], ["targetMonth", "asc"]] }),
    f.curriculumItems.list({ order: [["sortOrder", "asc"]] }),
    f.curriculumVideos.list({ order: [["createdAt", "desc"]] }),
    db.listStaff(),
    f.staffProfiles.list(),
    db.listStores(),
  ]);
  const provider = uploadProvider();
  const JobSelect = ({ value }: { value: string }) => (
    <select name="jobType" defaultValue={value} className="input">
      {JOB_TYPES.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const VideoSelect = ({ value }: { value: string | null }) => (
    <select name="videoId" defaultValue={value ?? ""} className="input">
      <option value="">動画なし</option>
      {videos
        .filter((x) => x.isActive)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.title}
          </option>
        ))}
    </select>
  );
  return (
    <div className="page-narrow">
      <PageHeader title="成長ロードマップの設定" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="trendingUp" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.growthStages} isAdmin />
      <TabLinks
        items={[
          { href: "/admin/growth?tab=stages", label: "段階", active: tab === "stages" },
          { href: "/admin/growth?tab=items", label: "カリキュラム", active: tab === "items" },
          { href: "/admin/growth?tab=videos", label: "動画", active: tab === "videos" },
          { href: "/admin/growth?tab=joined", label: "入社日", active: tab === "joined" },
        ]}
      />

      {tab === "stages" && (
        <div className="space-y-3">
          <Note>
            成長の段階は「入社から何か月で、どこまで」を表します。「求めること（コンピテンシー）」は1行に1つ書いてください。ENiのカリキュラム・コンピテンシーの資料が届いたら、ここに入れます。
          </Note>
          {stages.map((s) => (
            <details key={s.id} className="card !p-3.5">
              <summary className="cursor-pointer flex items-center gap-2">
                <span className="flex-1 text-sm font-bold">
                  {s.name}
                  <span className="text-[11px] font-normal text-ink-500 ml-1.5">
                    入社{s.targetMonth}か月・{JOB_TYPES.find(([v]) => v === s.jobType)?.[1] ?? "全員"}・項目 {items.filter((i) => i.stageId === s.id && i.isActive).length}
                  </span>
                </span>
                {!s.isActive && <StatusBadge label="使っていない" tone="muted" />}
              </summary>
              <form action={saveStageAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <StageFields s={s} JobSelect={JobSelect} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={s.isActive} /> 使う
                </label>
                <button type="submit" className="btn-primary btn-sm w-full">
                  保存
                </button>
              </form>
            </details>
          ))}
          <details className="card !p-3.5" open={stages.length === 0}>
            <summary className="cursor-pointer text-sm font-bold text-brand-700">＋ 段階を追加</summary>
            <form action={saveStageAction} className="mt-3 space-y-2">
              <StageFields s={null} JobSelect={JobSelect} />
              <button type="submit" className="btn-primary btn-sm w-full">
                追加
              </button>
            </form>
          </details>
        </div>
      )}

      {tab === "items" && (
        <div className="space-y-4">
          <Note>段階ごとに「合格する項目」を並べます。合格の判定は、幹部が「メンバーの成長」から入れます。</Note>
          {stages.length === 0 && <p className="text-sm text-ink-500">先に「段階」を追加してください。</p>}
          {stages.map((s) => (
            <section key={s.id}>
              <p className="text-xs font-bold text-ink-500 mb-1.5">
                {s.name}（入社{s.targetMonth}か月）
              </p>
              <div className="space-y-2">
                {items
                  .filter((i) => i.stageId === s.id)
                  .map((i) => (
                    <details key={i.id} className="card !p-3">
                      <summary className="cursor-pointer text-sm font-bold flex items-center gap-2">
                        <span className="flex-1">{i.title}</span>
                        {i.videoId && <StatusBadge label="動画" tone="pending" />}
                        {!i.isActive && <StatusBadge label="使っていない" tone="muted" />}
                      </summary>
                      <form action={saveItemAction} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="stageId" value={s.id} />
                        <ItemFields i={i} VideoSelect={VideoSelect} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="isActive" defaultChecked={i.isActive} /> 使う
                        </label>
                        <button type="submit" className="btn-primary btn-sm w-full">
                          保存
                        </button>
                      </form>
                    </details>
                  ))}
                <details className="card !p-3">
                  <summary className="cursor-pointer text-sm font-bold text-brand-700">＋ 項目を追加</summary>
                  <form action={saveItemAction} className="mt-2 space-y-2">
                    <input type="hidden" name="stageId" value={s.id} />
                    <ItemFields i={null} VideoSelect={VideoSelect} />
                    <button type="submit" className="btn-primary btn-sm w-full">
                      追加
                    </button>
                  </form>
                </details>
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "videos" && (
        <div className="space-y-3">
          <Note>
            動画はアプリの中だけで再生します（ログインしたスタッフにだけ、短い期限つきのURLを出します。ダウンロードのボタンは出しません）。
            推奨の置き場所は Cloudflare Stream です（費用・防ぎやすさの比べ方は docs/追加開発の確認手順.md）。
            いまの置き場所：<b>{PROVIDER_LABEL[provider]}</b>
          </Note>
          {provider !== "url" ? (
            <VideoUpload providerLabel={PROVIDER_LABEL[provider]} />
          ) : (
            <Note tone="warn">動画の置き場所（Cloudflare Stream）が未設定のため、いまは下の「URLで登録（試し用）」だけが使えます。</Note>
          )}
          <details className="card !p-3.5">
            <summary className="cursor-pointer text-sm font-bold text-brand-700">URLで登録（試し用・保護なし）</summary>
            <form action={registerVideoUrlAction} className="mt-2 space-y-2">
              <input name="title" className="input" placeholder="動画の名前" required maxLength={100} />
              <input name="url" className="input" placeholder="https://…（.mp4 か .m3u8）" required />
              <input name="durationMin" type="number" min={0} className="input" placeholder="長さ（分・分かれば）" />
              <textarea name="description" className="input min-h-16" placeholder="説明（任意）" maxLength={1000} />
              <button type="submit" className="btn-secondary btn-sm w-full">
                登録
              </button>
            </form>
          </details>
          {videos.map((x) => (
            <details key={x.id} className="card !p-3.5">
              <summary className="cursor-pointer flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{x.title}</span>
                  <span className="block text-[11px] text-ink-500">
                    {PROVIDER_LABEL[x.provider]}・{x.durationSec ? `${Math.round(x.durationSec / 60)}分` : "長さ不明"}
                  </span>
                </span>
                {x.status === "processing" ? (
                  <StatusBadge label="処理中" tone="warning" />
                ) : x.status === "error" ? (
                  <StatusBadge label="失敗" tone="danger" />
                ) : !x.isActive ? (
                  <StatusBadge label="使っていない" tone="muted" />
                ) : (
                  <StatusBadge label="公開中" tone="ok" />
                )}
              </summary>
              <form action={saveVideoAction} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={x.id} />
                <input name="title" defaultValue={x.title} className="input" maxLength={100} />
                <textarea name="description" defaultValue={x.description} className="input min-h-16" maxLength={1000} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={x.isActive} /> スタッフに見せる
                </label>
                <button type="submit" className="btn-primary btn-sm w-full">
                  保存
                </button>
              </form>
              <div className="flex gap-2 mt-2">
                <Link href={`/staff/growth/videos/${x.id}`} className="btn-secondary btn-sm flex-1">
                  再生してみる
                </Link>
                {x.provider === "cloudflare" && x.status === "processing" && (
                  <form action={refreshVideoAction} className="flex-1">
                    <input type="hidden" name="id" value={x.id} />
                    <button type="submit" className="btn-secondary btn-sm w-full">
                      処理の状態を確かめる
                    </button>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {tab === "joined" && (
        <form action={saveJoinedDatesAction} className="space-y-3">
          <Note>入社日から、段階の目安の時期（入社◯か月）と「遅れ」を出します。</Note>
          {stores.map((store) => {
            const members = staff.filter((s) => s.isActive && s.storeId === store.id && s.role !== "admin");
            if (members.length === 0) return null;
            return (
              <section key={store.id} className="card !p-3.5">
                <p className="text-xs font-bold text-ink-500 mb-2">{store.name}</p>
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{m.name}</span>
                      <input
                        type="date"
                        name={`joined_${m.id}`}
                        defaultValue={profiles.find((p) => p.staffId === m.id)?.joinedOn ?? ""}
                        className="input !w-40 !min-h-10 !py-1"
                        aria-label={`${m.name}さんの入社日`}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <button type="submit" className="btn-primary w-full">
            入社日を保存
          </button>
        </form>
      )}
    </div>
  );
}

function StageFields({
  s,
  JobSelect,
}: {
  s: { name: string; jobType: string; targetMonth: number; sortOrder: number; description: string; competencies: string } | null;
  JobSelect: (p: { value: string }) => React.ReactNode;
}) {
  return (
    <>
      <input name="name" defaultValue={s?.name ?? ""} className="input" placeholder="段階の名前（例：シャンプーデビュー）" required maxLength={80} />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-ink-500">
          入社から（か月）
          <input name="targetMonth" type="number" min={0} max={240} defaultValue={s?.targetMonth ?? 3} className="input" />
        </label>
        <label className="text-[11px] text-ink-500">
          並び順
          <input name="sortOrder" type="number" defaultValue={s?.sortOrder ?? 0} className="input" />
        </label>
        <label className="text-[11px] text-ink-500">
          対象
          <JobSelect value={s?.jobType ?? ""} />
        </label>
      </div>
      <textarea name="description" defaultValue={s?.description ?? ""} className="input min-h-16" placeholder="説明（任意）" maxLength={1000} />
      <textarea name="competencies" defaultValue={s?.competencies ?? ""} className="input min-h-24" placeholder={"求めること（1行に1つ）\n例：お客様に自分から声をかけられる"} maxLength={3000} />
    </>
  );
}

function ItemFields({
  i,
  VideoSelect,
}: {
  i: { title: string; description: string; videoId: string | null; requiredPracticeMinutes: number; sortOrder: number } | null;
  VideoSelect: (p: { value: string | null }) => React.ReactNode;
}) {
  return (
    <>
      <input name="title" defaultValue={i?.title ?? ""} className="input" placeholder="項目（例：シャンプー 合格）" required maxLength={100} />
      <textarea name="description" defaultValue={i?.description ?? ""} className="input min-h-14" placeholder="合格の基準など（任意）" maxLength={500} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-500">
          練習の目安（時間）
          <input name="practiceHours" type="number" min={0} step="0.5" defaultValue={i ? i.requiredPracticeMinutes / 60 : 0} className="input" />
        </label>
        <label className="text-[11px] text-ink-500">
          並び順
          <input name="sortOrder" type="number" defaultValue={i?.sortOrder ?? 0} className="input" />
        </label>
      </div>
      <label className="text-[11px] text-ink-500 block">
        動画
        <VideoSelect value={i?.videoId ?? null} />
      </label>
    </>
  );
}
