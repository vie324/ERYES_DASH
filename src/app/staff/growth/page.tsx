import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { growthTimeline, videoProgressFor, type StageProgress } from "@/lib/growth";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { Flash, MiniStat, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";
import { judgeItemAction } from "./actions";

export const dynamic = "force-dynamic";

function monthLabel(ym: string | null): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

// 依頼20（74）：カリキュラム・コンピテンシー・成長ロードマップを1本の時間軸で。
//  本人：入社からの位置・合格したカリキュラム・次の目標と目安の時期・練習時間（予定より遅れていれば分かる）
//  幹部：担当メンバーを ?staff= で開くと、項目ごとに合格の判定とコメントを入れられる
export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ staff?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  let target = v.me;
  if (params.staff && params.staff !== v.staffId) {
    const m = await db.getStaff(params.staff);
    if (!m || !canSeeMember(v, m)) redirect("/staff/growth");
    target = m;
  }
  if (!target) redirect("/staff");
  const isSelf = target.id === v.staffId;
  const canJudge = !isSelf && (v.isExec || v.isStoreManager);
  const [tl, progress, videos] = await Promise.all([
    growthTimeline(db, target),
    videoProgressFor(target.id),
    fx().curriculumVideos.list({ where: { isActive: true } }),
  ]);
  const passedAll = tl.stages.reduce((s, p) => s + p.passed, 0);
  const totalAll = tl.stages.reduce((s, p) => s + p.total, 0);
  const lateStages = tl.stages.filter((p) => p.late);
  const maxMonth = Math.max(12, ...tl.stages.map((p) => p.stage.targetMonth), (tl.monthsSinceJoin ?? 0) + 1);
  const practiceMax = Math.max(60, ...tl.practiceByMonth.map((p) => p.minutes));
  const back = isSelf ? "/staff/growth" : `/staff/growth?staff=${target.id}`;

  const StageCard = ({ p, index }: { p: StageProgress; index: number }) => {
    const isNext = tl.next?.stage.id === p.stage.id;
    const dot = p.done ? "bg-emerald-500 text-white" : p.late ? "bg-red-500 text-white" : isNext ? "bg-brand-600 text-white" : "bg-white text-ink-400 border border-ink-200";
    return (
      <li className="relative pl-10">
        <span className={`absolute left-0 top-1 w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${dot}`}>
          {p.done ? "✓" : index + 1}
        </span>
        <div className={`card !p-3.5 ${isNext ? "ring-2 ring-brand-300" : ""}`}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-ink-500">
                入社{p.stage.targetMonth}か月{p.targetMonth ? `（目安 ${monthLabel(p.targetMonth)}）` : ""}
              </p>
              <p className="text-sm font-bold text-ink-900">{p.stage.name}</p>
            </div>
            {p.done ? (
              <StatusBadge label="達成" tone="ok" />
            ) : p.late ? (
              <StatusBadge label="目安を過ぎています" tone="danger" />
            ) : isNext ? (
              <StatusBadge label="いまの目標" tone="pending" />
            ) : null}
          </div>
          {p.stage.description && <p className="text-xs text-ink-600 mt-1 leading-relaxed whitespace-pre-wrap">{p.stage.description}</p>}
          {p.stage.competencies && (
            <div className="mt-2 rounded-xl bg-brand-50/60 border border-brand-100 px-3 py-2">
              <p className="text-[11px] font-bold text-brand-700">この段階で求めること（コンピテンシー）</p>
              <ul className="mt-1 space-y-0.5">
                {p.stage.competencies
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => (
                    <li key={l} className="text-xs text-ink-700">
                      ・{l}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {p.items.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-ink-500 mt-3">
                カリキュラム（合格 {p.passed}/{p.total}）
              </p>
              <ul className="mt-1 divide-y divide-ink-100">
                {p.items.map((item) => {
                  const video = item.videoId ? videos.find((x) => x.id === item.videoId) : undefined;
                  const vp = video ? progress.get(video.id) : undefined;
                  const st = item.result?.status;
                  return (
                    <li key={item.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${st === "passed" ? "bg-emerald-500 text-white" : st === "retry" ? "bg-amber-400 text-white" : "bg-ink-100 text-ink-400"}`}>
                          {st === "passed" ? "✓" : st === "retry" ? "!" : ""}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-ink-800">{item.title}</span>
                        <span className="text-[11px] text-ink-500 shrink-0">{st === "passed" ? "合格" : st === "retry" ? "もう一度" : "まだ"}</span>
                      </div>
                      {(item.description || item.requiredPracticeMinutes > 0) && (
                        <p className="text-[11px] text-ink-500 mt-0.5 pl-7">
                          {item.description}
                          {item.requiredPracticeMinutes > 0 ? `${item.description ? "・" : ""}練習の目安 ${Math.round(item.requiredPracticeMinutes / 60)}時間` : ""}
                        </p>
                      )}
                      {item.result?.comment && <p className="text-[11px] text-brand-800 mt-0.5 pl-7">💬 {item.result.comment}</p>}
                      {video && (
                        <Link href={`/staff/growth/videos/${video.id}`} className="mt-1 ml-7 inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                          <Icon name="play" className="w-3.5 h-3.5" />
                          動画「{video.title}」{vp ? (vp.completed ? "（見終わりました）" : `（${vp.pct}%まで）`) : "（まだ見ていません）"}
                        </Link>
                      )}
                      {canJudge && (
                        <details className="mt-1 ml-7">
                          <summary className="text-xs font-bold text-brand-700 cursor-pointer">判定を入れる</summary>
                          <form action={judgeItemAction} className="mt-2 space-y-2">
                            <input type="hidden" name="staff" value={target.id} />
                            <input type="hidden" name="item" value={item.id} />
                            <input type="hidden" name="back" value={back} />
                            <div className="flex gap-1.5 flex-wrap">
                              {(
                                [
                                  ["passed", "合格"],
                                  ["retry", "もう一度"],
                                  ["clear", "取り消し"],
                                ] as const
                              ).map(([val, label]) => (
                                <label key={val}>
                                  <input type="radio" name="status" value={val} defaultChecked={val === (st ?? "passed")} className="peer sr-only" />
                                  <span className="chip !min-h-8 !py-0.5 cursor-pointer">{label}</span>
                                </label>
                              ))}
                            </div>
                            <input name="comment" defaultValue={item.result?.comment ?? ""} className="input !text-sm" placeholder="コメント（本人に届きます）" maxLength={500} />
                            <button type="submit" className="btn-primary btn-sm w-full">
                              保存して本人に知らせる
                            </button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="page-narrow">
      <PageHeader
        title={isSelf ? "成長ロードマップ" : `${target.name}さんの成長ロードマップ`}
        backHref={isSelf ? "/staff" : "/staff/growth/team"}
        backLabel={isSelf ? "ホームへ戻る" : "メンバーの一覧へ戻る"}
        icon="trendingUp"
        description="入社からの時間軸の上に、カリキュラム・求めること・練習時間を並べています"
      />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.growthStages} isAdmin={v.isAdmin} />
      <TabLinks
        items={[
          { href: "/staff/growth", label: "ロードマップ", active: isSelf },
          { href: "/staff/growth/videos", label: "動画", active: false },
          ...(v.isExec || v.isStoreManager ? [{ href: "/staff/growth/team", label: "メンバー", active: !isSelf }] : []),
        ]}
      />

      {tl.stages.length === 0 ? (
        <EmptyState
          message="成長の段階がまだ登録されていません"
          action={
            v.isAdmin ? (
              <Link href="/admin/growth" className="btn-primary btn-sm">
                管理画面で登録する
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat label="入社から" value={tl.monthsSinceJoin ?? "—"} unit={tl.monthsSinceJoin !== null ? "か月" : ""} />
            <MiniStat label="合格" value={`${passedAll}/${totalAll}`} tone={totalAll > 0 && passedAll === totalAll ? "ok" : undefined} />
            <MiniStat label="遅れ" value={lateStages.length} unit="段階" tone={lateStages.length ? "danger" : "ok"} />
          </div>
          {!tl.joinedOn && <Note tone="warn">入社日が未登録のため、目安の時期が出せません（管理者が「成長ロードマップの設定」で登録します）。</Note>}
          {tl.next && (
            <div className="card !p-3.5 my-3 border-brand-200">
              <p className="text-[11px] font-bold text-brand-700">次の目標</p>
              <p className="text-base font-bold text-ink-900">{tl.next.stage.name}</p>
              <p className="text-xs text-ink-500 mt-0.5">
                のこり {tl.next.total - tl.next.passed} 項目{tl.next.targetMonth ? `・目安 ${monthLabel(tl.next.targetMonth)}` : ""}
                {tl.next.late ? "（目安を過ぎています）" : ""}
              </p>
            </div>
          )}

          {/* 1本の時間軸（入社からの月数。段階の目安の位置と、いまの位置） */}
          <section className="card !p-3.5 mb-4" aria-label="時間軸">
            <p className="text-[11px] font-bold text-ink-500 mb-6">入社からの時間軸</p>
            <div className="relative h-2 rounded-full bg-ink-100 mx-2">
              {tl.monthsSinceJoin !== null && (
                <div className="absolute left-0 top-0 h-2 rounded-full bg-brand-300" style={{ width: `${Math.min(100, (tl.monthsSinceJoin / maxMonth) * 100)}%` }} />
              )}
              {tl.stages.map((p) => (
                <span
                  key={p.stage.id}
                  title={p.stage.name}
                  className={`absolute -top-1 w-4 h-4 -ml-2 rounded-full border-2 border-white ${p.done ? "bg-emerald-500" : p.late ? "bg-red-500" : "bg-ink-300"}`}
                  style={{ left: `${(p.stage.targetMonth / maxMonth) * 100}%` }}
                />
              ))}
              {tl.monthsSinceJoin !== null && (
                <span className="absolute -top-6 -ml-4 text-[10px] font-bold text-brand-700 whitespace-nowrap" style={{ left: `${Math.min(100, (tl.monthsSinceJoin / maxMonth) * 100)}%` }}>
                  ▼いま
                </span>
              )}
            </div>
            <div className="flex justify-between text-[10px] text-ink-400 mt-2 px-1">
              <span>入社</span>
              <span>{Math.round(maxMonth / 2)}か月</span>
              <span>{maxMonth}か月</span>
            </div>
          </section>

          <ol className="space-y-3 mb-6">
            {tl.stages.map((p, i) => (
              <StageCard key={p.stage.id} p={p} index={i} />
            ))}
          </ol>
        </>
      )}

      <section className="card !p-3.5 mb-6" aria-label="練習時間">
        <p className="text-[11px] font-bold text-ink-500 mb-2">練習時間（月ごと）</p>
        <ul className="space-y-1.5">
          {tl.practiceByMonth.map((m) => (
            <li key={m.month} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-ink-500 tabular-nums">{Number(m.month.slice(5))}月</span>
              <span className="flex-1 h-2.5 rounded-full bg-ink-100 overflow-hidden">
                <span className="block h-full bg-brand-400 rounded-full" style={{ width: `${(m.minutes / practiceMax) * 100}%` }} />
              </span>
              <span className="w-14 text-right tabular-nums text-ink-700">{(m.minutes / 60).toFixed(1)}時間</span>
            </li>
          ))}
        </ul>
        <Link href="/staff/practice" className="block text-xs font-bold text-brand-700 mt-2">
          練習時間を記録する →
        </Link>
      </section>
    </div>
  );
}
