import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx, aiTrainings } from "@/lib/data/tables";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeJa } from "@/lib/date";
import { TRAINING_KINDS, kindLabel, listTrainings } from "@/lib/ai-shimon/training";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  createTrainingAction,
  deleteTrainingAction,
  moveTrainingAction,
  restoreTrainingAction,
  toggleTrainingAction,
  updateTrainingAction,
} from "./actions";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  create: "作成",
  update: "編集",
  stop: "停止",
  start: "再開",
  move_up: "並べ替え",
  move_down: "並べ替え",
  delete: "削除",
  restore: "戻した",
};

// 依頼11（69）：AIしもんの教育（代表だけ。管理者でも代表でなければ開けない）。
// 項目ごとに登録・停止・並べ替え・修正ができ、変更の履歴から前の状態に戻せる。
export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; history?: string }> }) {
  const session = await requireSession();
  if (!(await hasPermission(session, "ai_shimon_training"))) redirect("/staff/ai-shimon");
  const params = await searchParams;
  const db = getDataStore();
  const [items, staff] = await Promise.all([listTrainings(), db.listStaff()]);
  const nameOf = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? "（退職したスタッフ）") : "");
  const history = params.history
    ? await fx().aiTrainingRevisions.list({ where: { trainingId: params.history }, order: [["createdAt", "desc"]], limit: 30 })
    : (await fx().aiTrainingRevisions.list({ order: [["createdAt", "desc"]], limit: 15 }));

  return (
    <div className="page-narrow">
      <PageHeader title="AIしもんの教育" backHref="/staff/ai-shimon" backLabel="AIしもんへ戻る" description="代表だけが見られる・直せる画面です" icon="sparkles" />
      <NotReadyNotice table={aiTrainings} isAdmin={session.role === "admin"} />
      <Flash ok={params.ok} error={params.error} />
      <Note tone="warn">
        ここに書いたことは、全員への答えに使われます。相談した人が分かる内容（名前・具体的な出来事）は書かず、「こういう相談には、こう答える」の形にしてください。
        スタッフとの会話は、その会話の中でだけ使い、ほかの人や次の会話には持ち越しません。
      </Note>

      <form action={createTrainingAction} className="card space-y-3 mt-4">
        <h2 className="section-title">新しく足す</h2>
        <div className="flex flex-wrap gap-2">
          {TRAINING_KINDS.map((k, i) => (
            <label key={k.key} title={k.hint}>
              <input type="radio" name="kind" value={k.key} defaultChecked={i === 0} className="peer sr-only" />
              <span className="chip peer-checked:chip-active cursor-pointer">{k.label}</span>
            </label>
          ))}
        </div>
        <input name="title" className="input" placeholder="見出し（任意）例）失敗したとき" maxLength={80} />
        <textarea name="body" rows={4} required className="input min-h-28" maxLength={4000} placeholder="例）失敗した話を聞いたら、まず「よく話してくれたね」と受け止めてから、次の一歩を一緒に決める" />
        <button type="submit" className="btn-primary w-full">
          教育に足す
        </button>
      </form>

      <h2 className="section-title mt-6">いまの教育（{items.filter((i) => i.isActive).length}件を使用中）</h2>
      {items.length === 0 ? (
        <EmptyState message="まだ教育の項目はありません。上から足すと、次の相談からAIしもんの答えに反映されます" />
      ) : (
        <div className="space-y-3">
          {TRAINING_KINDS.map((k) => {
            const group = items.filter((i) => i.kind === k.key);
            if (group.length === 0) return null;
            return (
              <section key={k.key}>
                <p className="text-xs font-bold text-ink-500 mb-1.5">{k.label}</p>
                <div className="space-y-2">
                  {group.map((item, idx) => (
                    <details key={item.id} id={`tr-${item.id}`} className={`card !p-3.5 scroll-mt-20 ${item.isActive ? "" : "opacity-60"}`}>
                      <summary className="cursor-pointer list-none">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1">
                            {item.title && <span className="block text-sm font-bold text-ink-900">{item.title}</span>}
                            <span className="block text-sm text-ink-700 whitespace-pre-wrap line-clamp-3">{item.body}</span>
                            {item.sourceStaffId && (
                              <span className="block text-[11px] text-ink-400 mt-1">相談から追加（{nameOf(item.sourceStaffId)}さんの相談。この情報はAIには渡しません）</span>
                            )}
                          </span>
                          {!item.isActive && <span className="shrink-0 rounded-full bg-ink-200 px-2 py-0.5 text-[11px] font-bold text-ink-600">停止中</span>}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2">
                        <form action={updateTrainingAction} className="space-y-2">
                          <input type="hidden" name="id" value={item.id} />
                          <select name="kind" defaultValue={item.kind} className="input !min-h-11 !py-2 !text-sm">
                            {TRAINING_KINDS.map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                          <input name="title" defaultValue={item.title} className="input !min-h-11 !py-2 !text-sm" maxLength={80} />
                          <textarea name="body" defaultValue={item.body} rows={4} className="input !text-sm" maxLength={4000} />
                          <button type="submit" className="btn-secondary btn-sm w-full">
                            直す
                          </button>
                        </form>
                        <div className="flex flex-wrap gap-2">
                          <form action={toggleTrainingAction}>
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" className="btn-ghost !text-xs">
                              {item.isActive ? "止める" : "使う"}
                            </button>
                          </form>
                          {idx > 0 && (
                            <form action={moveTrainingAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="dir" value="up" />
                              <button type="submit" className="btn-ghost !text-xs">
                                ↑ 上へ
                              </button>
                            </form>
                          )}
                          {idx < group.length - 1 && (
                            <form action={moveTrainingAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="dir" value="down" />
                              <button type="submit" className="btn-ghost !text-xs">
                                ↓ 下へ
                              </button>
                            </form>
                          )}
                          <a href={`/staff/ai-shimon/training?history=${item.id}#history`} className="btn-ghost !text-xs">
                            履歴
                          </a>
                          <form action={deleteTrainingAction} className="ml-auto">
                            <input type="hidden" name="id" value={item.id} />
                            <ConfirmSubmit className="btn-ghost !text-xs !text-red-500" message="この項目を消しますか？（履歴から戻せます）">
                              消す
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <h2 id="history" className="section-title mt-6 scroll-mt-20">
        変更の履歴{params.history ? "（この項目）" : "（新しい順）"}
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-ink-500">まだ履歴はありません</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => {
            const snap = h.snapshot as { kind?: string; title?: string; body?: string; isActive?: boolean };
            return (
              <li key={h.id} className="card-quiet !p-3">
                <p className="text-[11px] font-bold text-ink-500">
                  {formatDateTimeJa(h.createdAt)}・{ACTION_LABEL[h.action] ?? h.action}・{kindLabel(String(snap.kind ?? ""))}
                  {snap.isActive === false ? "（停止）" : ""}
                </p>
                <p className="text-sm text-ink-800 whitespace-pre-wrap line-clamp-3 mt-0.5">
                  {snap.title ? `${snap.title}：` : ""}
                  {String(snap.body ?? "")}
                </p>
                <form action={restoreTrainingAction} className="mt-1.5 text-right">
                  <input type="hidden" name="revision" value={h.id} />
                  <ConfirmSubmit className="btn-ghost !text-xs" message="この時点の中身に戻しますか？">
                    この状態に戻す
                  </ConfirmSubmit>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
