import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { formatDateJa } from "@/lib/date";
import { PERIOD_LABEL, currentWeekKey, getGoalSettings, goalTreeFor, lastWeekKey } from "@/lib/goals";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/feature-ui";
import { addFeedbackAction } from "../actions";

export const dynamic = "force-dynamic";

// 依頼19：担当メンバー（同じ店舗。管理者は全員）の目標・アクションプラン・振り返りに、幹部がコメントやスタンプを返す。
export default async function GoalsTeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff/goals");
  const params = await searchParams;
  const db = getDataStore();
  const settings = await getGoalSettings(db);
  const members = (await db.listStaff()).filter((s) => s.isActive && s.role !== "admin" && s.id !== v.staffId && canSeeMember(v, s));
  const weeks = [currentWeekKey(), lastWeekKey()];
  const rows = await Promise.all(
    members.map(async (m) => {
      const [tree, refl] = await Promise.all([
        goalTreeFor(db, m.id, m.storeId),
        fx().reflections.list({ where: { staffId: m.id, weekKey: { in: weeks } }, order: [["weekKey", "desc"]] }),
      ]);
      const fb = await fx().goalFeedback.list({ where: { targetType: "reflection", targetId: { in: refl.map((r) => r.id) } } });
      return { m, tree, refl, fb };
    })
  );
  const Feedback = ({ type, target, owner }: { type: "goal" | "reflection"; target: string; owner: string }) => (
    <form action={addFeedbackAction} className="flex flex-wrap gap-1.5 mt-2">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="back" value="/staff/goals/team" />
      {settings.stamps.map((s, i) => (
        <label key={s}>
          <input type="radio" name="stamp" value={s} defaultChecked={i === 0} className="peer sr-only" />
          <span className="chip !min-h-8 !py-0.5 !px-2 !text-base cursor-pointer">{s}</span>
        </label>
      ))}
      <input name="body" className="input !min-h-9 !py-1 !text-xs flex-1 min-w-32" placeholder="ひとこと（任意）" maxLength={500} />
      <button type="submit" className="btn-secondary btn-sm !min-h-9 !py-1">
        返す
      </button>
    </form>
  );
  return (
    <div className="page-narrow">
      <PageHeader title="担当メンバーの目標" backHref="/staff/goals" backLabel="目標へ戻る" icon="users" description="振り返りに返事をすると、本人に通知が届きます" />
      <Flash ok={params.ok} error={params.error} />
      {rows.length === 0 ? (
        <EmptyState message="担当メンバーがいません" />
      ) : (
        <div className="space-y-4">
          {rows.map(({ m, tree, refl, fb }) => (
            <section key={m.id} className="card">
              <p className="text-sm font-bold text-ink-900">{m.name}</p>
              {tree.personal.length === 0 ? (
                <p className="text-xs text-ink-500 mt-1">目標はまだありません</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {tree.personal.slice(0, 4).map((n) => (
                    <li key={n.goal.id} className="card-quiet !p-2.5">
                      <p className="text-[11px] text-brand-700 font-bold">{PERIOD_LABEL[n.goal.periodType]}</p>
                      <p className="text-sm font-bold">
                        {n.goal.title} <span className="text-xs text-ink-500">{n.progress !== null ? `${n.progress}%` : ""}</span>
                      </p>
                      {n.plans.length > 0 && <p className="text-[11px] text-ink-500">{n.plans.map((p) => p.title).join("・")}</p>}
                      <Feedback type="goal" target={n.goal.id} owner={m.id} />
                    </li>
                  ))}
                </ul>
              )}
              {refl.map((r) => {
                const answered = fb.some((f) => f.targetId === r.id);
                return (
                  <div key={r.id} className="mt-3 rounded-xl border border-brand-100 p-2.5">
                    <p className="text-xs font-bold flex items-center gap-2">
                      {formatDateJa(r.weekKey)}の週の振り返り
                      {answered ? <StatusBadge label="返した" tone="ok" /> : <StatusBadge label="まだ返していない" tone="warning" />}
                    </p>
                    {r.done && <p className="text-xs mt-1">できた：{r.done}</p>}
                    {r.notDone && <p className="text-xs">できなかった：{r.notDone}</p>}
                    {r.next && <p className="text-xs">来週：{r.next}</p>}
                    <Feedback type="reflection" target={r.id} owner={m.id} />
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
