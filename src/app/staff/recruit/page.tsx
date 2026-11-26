import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { canManageRecruit, DECISION_LABEL, ENDED, getRecruitSettings, STATUS_LABEL, visibleApplicants } from "@/lib/recruit";
import { formatDateJa, todayJst } from "@/lib/date";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";
import { createApplicantAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼23：応募者の一覧（名前・応募日・経路・段階）。管理側は全員、面接官は自分が入る面接の応募者だけ。
export default async function RecruitPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const [manage, all, settings, stores, interviews] = await Promise.all([
    canManageRecruit(v.me),
    visibleApplicants(v.me),
    getRecruitSettings(db),
    db.listStores(),
    fx().interviews.list({ where: { status: "scheduled" }, order: [["date", "asc"], ["startTime", "asc"]] }),
  ]);
  const view = params.view === "ended" ? "ended" : params.view === "all" ? "all" : "active";
  const list = all.filter((a) => (view === "all" ? true : view === "ended" ? ENDED.includes(a.status) : !ENDED.includes(a.status)));
  const today = todayJst();
  const nextOf = (id: string) => interviews.find((i) => i.applicantId === id && i.date >= today);
  return (
    <div className="page-narrow">
      <PageHeader title="面接・応募者" backHref="/staff" backLabel="ホームへ戻る" icon="users" description={manage ? "応募者の登録・面接の予定・評価・判定" : "面接官に選ばれた応募者だけが出ます"} />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.applicants} isAdmin={v.isAdmin} />
      <TabLinks
        items={[
          { href: "/staff/recruit", label: "選考中", active: view === "active" },
          { href: "/staff/recruit?view=ended", label: "選考が終わった", active: view === "ended" },
          { href: "/staff/recruit?view=all", label: "すべて", active: view === "all" },
        ]}
      />
      {manage && (
        <details className="card !p-3.5 mb-4">
          <summary className="cursor-pointer text-sm font-bold text-brand-700">＋ 応募者を登録</summary>
          <form action={createApplicantAction} className="mt-3 space-y-2">
            <input name="name" className="input" placeholder="名前" required maxLength={60} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-500">
                応募日
                <input name="appliedOn" type="date" defaultValue={today} className="input" />
              </label>
              <label className="text-[11px] text-ink-500">
                経路
                <select name="source" className="input" defaultValue={settings.sources[0]}>
                  {settings.sources.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-ink-500">
                段階
                <select name="stage" className="input" defaultValue={settings.stages[0]}>
                  {settings.stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-ink-500">
                希望の店舗
                <select name="storeId" className="input" defaultValue="">
                  <option value="">未定</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea name="note" className="input min-h-16" placeholder="メモ（任意）" maxLength={2000} />
            <Note>連絡先などの細かい個人情報はkatibito側にあるので、ここには選考に要ることだけを書いてください。</Note>
            <button type="submit" className="btn-primary w-full">
              登録
            </button>
          </form>
        </details>
      )}
      {list.length === 0 ? (
        <EmptyState message={manage ? "応募者はいません" : "面接官に選ばれた応募者はいません"} />
      ) : (
        <ul className="space-y-2 mb-8">
          {list.map((a) => {
            const next = nextOf(a.id);
            return (
              <li key={a.id}>
                <Link href={`/staff/recruit/${a.id}`} className="card !p-3.5 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-ink-900 truncate">{a.name}</span>
                    <span className="block text-[11px] text-ink-500 truncate">
                      {a.appliedOn ? `${formatDateJa(a.appliedOn)}応募` : ""}・{a.source || "経路不明"}・{a.stage || "—"}
                    </span>
                    {next && (
                      <span className="block text-[11px] font-bold text-brand-700 mt-0.5">
                        次の面接：{formatDateJa(next.date)} {next.startTime}〜
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge label={STATUS_LABEL[a.status]} tone={a.status === "active" ? "pending" : a.status === "hired" ? "ok" : "muted"} />
                    {a.decision && <StatusBadge label={DECISION_LABEL[a.decision]} tone={a.decision === "pass" ? "ok" : a.decision === "fail" ? "danger" : "warning"} />}
                  </span>
                  <Icon name="chevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
