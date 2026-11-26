import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { tables } from "@/lib/data/tables";
import { getRecruitSettings } from "@/lib/recruit";
import { PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { saveRecruitSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼23：面接の設定（管理者だけ）。採用・面接の管理の権限は「人ごとの権限」（/admin/permissions）で付ける。
export default async function AdminRecruitPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const s = await getRecruitSettings(getDataStore());
  return (
    <div className="page-narrow">
      <PageHeader title="面接の設定" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="users" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.applicants} isAdmin />
      <Note>
        応募者の登録・面接の予定を作れるのは、管理者と「採用・面接の管理」の権限を付けた人です（
        <Link href="/admin/permissions" className="underline">
          人ごとの権限
        </Link>
        ）。面接官に選ばれた人は、その応募者だけを見られます。
      </Note>
      <form action={saveRecruitSettingsAction} className="card !p-3.5 space-y-3 mt-4 mb-8">
        <label className="text-[11px] text-ink-500 block">
          選考の段階（1行に1つ）
          <textarea name="stages" defaultValue={s.stages.join("\n")} className="input min-h-28" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          応募の経路（1行に1つ）
          <textarea name="sources" defaultValue={s.sources.join("\n")} className="input min-h-24" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          評価シートの項目（1行に1つ・「記号|項目名|満点」。新しい項目は「項目名|満点」だけでよい）
          <textarea name="items" defaultValue={s.evaluationItems.map((i) => `${i.key}|${i.label}|${i.max}`).join("\n")} className="input min-h-32 font-mono text-xs" />
          <span className="block mt-1">左の記号は、これまでの評価とつなぐためのものです。項目名を直すときも記号は変えないでください。</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-ink-500">
            録画の保存期間（選考が終わってから・か月）
            <input name="retentionMonths" type="number" min={1} max={60} defaultValue={s.retentionMonths} className="input" />
          </label>
          <label className="text-[11px] text-ink-500">
            面接官の人数（まで）
            <input name="maxInterviewers" type="number" min={1} max={5} defaultValue={s.maxInterviewers} className="input" />
          </label>
        </div>
        <label className="text-[11px] text-ink-500 block">
          録画を上げるときの同意の文（チェックを入れないと上げられません）
          <textarea name="consentText" defaultValue={s.consentText} className="input min-h-20" maxLength={500} />
        </label>
        <button type="submit" className="btn-primary w-full">
          保存
        </button>
      </form>
    </div>
  );
}
