import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, goals as goalsTable } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { formatDateJa, formatDateTimeJa, todayJst } from "@/lib/date";
import { PYRAMID_SETTINGS } from "@/lib/eni/forms";
import { PERIOD_LABEL, currentWeekKey, getGoalSettings, goalTreeFor } from "@/lib/goals";
import { getOrCreateSuggestion } from "@/lib/goals/suggest";
import { PageHeader, EmptyState } from "@/components/ui";
import { AiBadge, Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { addPlanAction, archiveGoalAction, createSuggestionAction, decideSuggestionAction, saveGoalAction, saveReflectionAction } from "./actions";

export const dynamic = "force-dynamic";

function Bar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-ink-400">進み具合：まだ</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="text-[11px] font-bold tabular-nums w-9 text-right">{value}%</span>
    </span>
  );
}

// 依頼19：目標・ピラミッド・アクションプラン（会社 → 店舗 → 個人）。AIの今週・今月やること、週の振り返りと幹部のフィードバック。
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();
  const [tree, settings, pyramid, weekS, monthS, reflection, reflectionsPast, staff] = await Promise.all([
    goalTreeFor(db, v.staffId, v.me?.storeId ?? ""),
    getGoalSettings(db),
    db.listAssistantSettings(v.staffId),
    getOrCreateSuggestion(db, v.staffId, "week", { create: false }),
    getOrCreateSuggestion(db, v.staffId, "month", { create: false }),
    fx().reflections.find({ staffId: v.staffId, weekKey: currentWeekKey() }),
    fx().reflections.list({ where: { staffId: v.staffId }, order: [["weekKey", "desc"]], limit: 4 }),
    db.listStaff(),
  ]);
  const fbReflections = await fx().goalFeedback.list({ where: { targetType: "reflection", targetId: { in: reflectionsPast.map((r) => r.id) } } });
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "";
  const pyr = (key: string) => pyramid.find((p) => p.settingKey === key)?.content ?? "";

  return (
    <div className="page-narrow">
      <PageHeader title="目標・アクションプラン" backHref="/staff" icon="trendingUp" description="会社 → 店舗 → 自分の目標をつなげて、今週やることまで" />
      <NotReadyNotice table={goalsTable} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />

      {/* 会社・店舗の目標 */}
      <section className="card mb-4">
        <h2 className="section-title">会社・店舗の目標</h2>
        {tree.company.length + tree.store.length === 0 ? (
          <p className="text-sm text-ink-500">まだ入っていません（会社の目標・5年後の姿は、ENiから届き次第、管理者が入れます）</p>
        ) : (
          <ul className="space-y-1.5">
            {[...tree.company, ...tree.store].map((g) => (
              <li key={g.id} className="text-sm">
                <span className="text-[11px] font-bold text-brand-700 mr-1.5">
                  {g.level === "company" ? "会社" : "店舗"}・{PERIOD_LABEL[g.periodType]}
                </span>
                <span className="font-bold">{g.title}</span>
                {g.targetValue ? <span className="text-ink-500">（{g.targetValue.toLocaleString()}{g.unit}）</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ピラミッド（今の機能をそのまま土台に） */}
      <section className="card mb-4">
        <div className="flex items-center">
          <h2 className="section-title !mb-0 flex-1">ピラミッド</h2>
          <Link href={v.me?.jobType === "stylist" ? "/staff/eni-report" : "/staff/weekly-report"} className="text-xs font-bold text-brand-700 underline">
            直す
          </Link>
        </div>
        <div className="mt-2 space-y-1.5">
          {PYRAMID_SETTINGS.map((p, i) => (
            <div key={p.key} className="rounded-xl bg-brand-50/70 border border-brand-100 px-3 py-2" style={{ marginLeft: `${i * 8}px`, marginRight: `${i * 8}px` }}>
              <p className="text-[11px] font-bold text-brand-700">{p.label}</p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap">{pyr(p.key) || "（まだ）"}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AIの今週・今月やること */}
      <section id="suggest" className="card mb-4 scroll-mt-20 !border-violet-200">
        <h2 className="section-title">今週・今月いちばんやるべきこと</h2>
        {([["week", weekS, "今週"], ["month", monthS, "今月"]] as const).map(([scope, s, label]) => (
          <div key={scope} className="mb-3 last:mb-0">
            <p className="text-xs font-bold text-ink-600 mb-1.5 flex items-center gap-2">
              {label}
              {s?.ai && <AiBadge />}
            </p>
            {!s ? (
              <form action={createSuggestionAction}>
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="btn-secondary btn-sm w-full">
                  {label}のやるべきことを出す
                </button>
              </form>
            ) : (
              <ul className="space-y-2">
                {s.items.map((it, i) => (
                  <li key={i} className={`rounded-xl border px-3 py-2 ${it.status === "adopted" ? "border-emerald-200 bg-emerald-50/50" : it.status === "rejected" ? "border-ink-100 opacity-50" : "border-violet-100 bg-violet-50/40"}`}>
                    <p className="text-sm font-bold text-ink-900">{it.text}</p>
                    {it.detail && <p className="text-[11px] text-ink-500">{it.detail}</p>}
                    {it.status === "pending" ? (
                      <form action={decideSuggestionAction} className="flex gap-1.5 mt-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="index" value={i} />
                        <input name="text" defaultValue={it.text} className="input !min-h-9 !py-1 !text-xs flex-1" aria-label="直してから採用" maxLength={60} />
                        <button type="submit" name="decision" value="adopt" className="btn-primary btn-sm !min-h-9 !py-1 shrink-0">
                          採用
                        </button>
                        <button type="submit" name="decision" value="reject" className="btn-ghost !text-xs shrink-0">
                          却下
                        </button>
                      </form>
                    ) : (
                      <p className="text-[11px] font-bold mt-1 text-ink-500">{it.status === "adopted" ? "✓ 採用してタスクにしました" : "却下しました"}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <p className="text-[11px] text-ink-400 mt-2">毎週月曜と毎月1日に、目標・進み具合・日報の提出・稼働率・練習時間から作ります（1人1週1回）。採用するとタスクになります。</p>
      </section>

      {/* 自分の目標 */}
      <section className="mb-4">
        <h2 className="section-title">自分の目標</h2>
        {tree.personal.length === 0 ? (
          <EmptyState message="まだ目標がありません。下から年と月の目標を立てましょう" />
        ) : (
          <div className="space-y-3">
            {tree.personal.map((n) => (
              <div key={n.goal.id} className="card !p-3.5">
                <p className="text-[11px] font-bold text-brand-700">
                  {PERIOD_LABEL[n.goal.periodType]}（{n.goal.periodKey}）{n.goal.area && `・${n.goal.area}`}
                </p>
                <p className="text-sm font-bold text-ink-900">
                  {n.goal.title}
                  {n.goal.targetValue ? <span className="text-ink-500 font-normal">（{n.goal.targetValue.toLocaleString()}{n.goal.unit}）</span> : null}
                </p>
                <div className="mt-1.5">
                  <Bar value={n.progress} />
                </div>
                {n.plans.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {n.plans.map((p) => (
                      <li key={p.id} className="text-xs flex items-center gap-2">
                        <span className={p.done ? "line-through text-ink-400" : "text-ink-700"}>
                          {p.kind === "routine" ? "🔁" : "☐"} {p.title}
                        </span>
                        <span className="ml-auto text-ink-500">{p.progress !== null ? `${p.progress}%` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {n.feedback.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {n.feedback.map((f) => (
                      <li key={f.id} className="text-xs rounded-lg bg-amber-50 px-2 py-1">
                        <span className="font-bold">{nameOf(f.fromStaffId)}</span>
                        {f.stamp && <span className="ml-1 text-base">{f.stamp}</span>} {f.body}
                      </li>
                    ))}
                  </ul>
                )}
                <details className="mt-2">
                  <summary className="text-xs font-bold text-brand-700 underline cursor-pointer">アクションプランを足す</summary>
                  <form action={addPlanAction} className="grid grid-cols-2 gap-2 mt-2">
                    <input type="hidden" name="goal" value={n.goal.id} />
                    <input name="title" required className="input !min-h-10 !py-1.5 col-span-2" placeholder="例）毎朝10分ウィッグを巻く" maxLength={80} />
                    <select name="kind" className="input !min-h-10 !py-1.5">
                      <option value="routine">ルーティン（くり返し）</option>
                      <option value="task">タスク（1回）</option>
                    </select>
                    <select name="repeat" className="input !min-h-10 !py-1.5">
                      <option value="daily">毎日</option>
                      <option value="weekly">毎週</option>
                    </select>
                    <input name="due" type="date" min={today} className="input !min-h-10 !py-1.5" aria-label="タスクの期限" />
                    <select name="weekday" className="input !min-h-10 !py-1.5" aria-label="毎週の曜日" defaultValue="1">
                      {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
                        <option key={w} value={i}>
                          {w}曜
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary btn-sm col-span-2">
                      足す（タスク・ルーティンに登録）
                    </button>
                  </form>
                </details>
                <form action={archiveGoalAction} className="text-right mt-1">
                  <input type="hidden" name="id" value={n.goal.id} />
                  <button type="submit" className="text-[11px] text-ink-400 underline">
                    この目標を外す
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        <details className="card mt-3" open={tree.personal.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-bold text-brand-700">＋ 目標を立てる</summary>
          <form action={saveGoalAction} className="grid grid-cols-2 gap-2 mt-3">
            <input type="hidden" name="level" value="personal" />
            <select name="period_type" className="input !min-h-11 !py-2">
              <option value="month">今月の目標</option>
              <option value="year">今年の目標</option>
            </select>
            <select name="area" className="input !min-h-11 !py-2">
              {settings.areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input name="title" required maxLength={120} className="input !min-h-11 !py-2 col-span-2" placeholder="例）指名を月10名いただく" />
            <input name="target" inputMode="decimal" className="input !min-h-11 !py-2" placeholder="数字の目標（任意）" />
            <input name="unit" className="input !min-h-11 !py-2" placeholder="単位（名・円・時間）" maxLength={10} />
            <select name="parent" className="input !min-h-11 !py-2 col-span-2" defaultValue="">
              <option value="">つながる会社・店舗の目標（任意）</option>
              {[...tree.company, ...tree.store].map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary btn-sm col-span-2">
              目標を立てる
            </button>
          </form>
        </details>
      </section>

      {/* 週の振り返り */}
      <section id="reflection" className="card scroll-mt-20">
        <h2 className="section-title">今週の振り返り（{formatDateJa(currentWeekKey())}の週）</h2>
        <form action={saveReflectionAction} className="space-y-2">
          <textarea name="done" defaultValue={reflection?.done ?? ""} rows={2} className="input !text-sm" placeholder="できたこと" maxLength={1000} />
          <textarea name="not_done" defaultValue={reflection?.notDone ?? ""} rows={2} className="input !text-sm" placeholder="できなかったこと" maxLength={1000} />
          <textarea name="next" defaultValue={reflection?.next ?? ""} rows={2} className="input !text-sm" placeholder="来週やること" maxLength={1000} />
          <button type="submit" className="btn-primary btn-sm w-full">
            保存（幹部が返事をくれます）
          </button>
        </form>
        {reflectionsPast.length > 0 && (
          <ul className="mt-4 space-y-2">
            {reflectionsPast.map((r) => (
              <li key={r.id} className="card-quiet !p-2.5 text-xs">
                <p className="font-bold">{formatDateJa(r.weekKey)}の週</p>
                {r.done && <p>できた：{r.done}</p>}
                {r.notDone && <p>できなかった：{r.notDone}</p>}
                {r.next && <p>来週：{r.next}</p>}
                {fbReflections
                  .filter((f) => f.targetId === r.id)
                  .map((f) => (
                    <p key={f.id} className="mt-1 rounded bg-amber-50 px-2 py-1">
                      {f.stamp} <span className="font-bold">{nameOf(f.fromStaffId)}</span>：{f.body}
                      <span className="text-ink-400 ml-1">{formatDateTimeJa(f.createdAt)}</span>
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(v.isExec || v.isStoreManager) && (
        <p className="text-center mt-4">
          <Link href="/staff/goals/team" className="text-sm font-bold text-brand-700 underline">
            担当メンバーの目標・振り返りを見る（幹部）
          </Link>
        </p>
      )}
      <Note>マンダラに書いていた内容は、ここ（目標・アクションプラン）に置き換えます。マンダラの項目が分かったら、目標の分け方を管理画面でそろえます。</Note>
    </div>
  );
}
