import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { AUDIENCE_LABEL, INPUT_DEFS, getRequiredInputsSettings, type Audience, type InputKey } from "@/lib/required-inputs";
import { getIncentiveSettings } from "@/lib/required-inputs/incentive";
import { getConfirmGateSettings } from "@/lib/confirm-gate";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { saveRequiredInputsAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼14：入力の必須化／インセンティブの締め日／予定を確認しないと先に進めない形 の設定（管理者だけ）
export default async function RequiredInputsSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [req, inc, gate] = await Promise.all([getRequiredInputsSettings(db), getIncentiveSettings(db), getConfirmGateSettings(db)]);
  const keys = Object.keys(INPUT_DEFS) as InputKey[];
  const audiences = Object.keys(AUDIENCE_LABEL) as Audience[];
  return (
    <div className="page-narrow">
      <PageHeader title="必須入力・締め日・予定の確認" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="checkCircle" />
      <Flash ok={params.ok} error={params.error} />
      <form action={saveRequiredInputsAction} className="space-y-4">
        <section className="card space-y-3">
          <h2 className="section-title">毎日の必須入力（ロールごと）</h2>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="enabled" defaultChecked={req.enabled} className="w-4 h-4" />
            必須入力を使う（ホームの「まだの入力」・通知）
          </label>
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>だれが</th>
                  {keys.map((k) => (
                    <th key={k} className="!text-center !whitespace-normal min-w-16">
                      {INPUT_DEFS[k].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audiences.map((a) => (
                  <tr key={a}>
                    <td className="font-bold">{AUDIENCE_LABEL[a]}</td>
                    {keys.map((k) => (
                      <td key={k} className="text-center">
                        <input type="checkbox" name={`rule_${a}_${k}`} defaultChecked={req.rules[a]?.includes(k)} className="w-4 h-4" aria-label={`${AUDIENCE_LABEL[a]}：${INPUT_DEFS[k].label}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>当てはまらないものは出しません（例：アシスタントの日報・売上は出さず、週報だけ）。休みの日は出しません。打刻は、打刻を使う店舗だけ。</Note>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-ink-600">
              通知する時刻（日本時間）
              <select name="notify_hour" defaultValue={req.notifyHour} className="input !min-h-11 !py-2 mt-1">
                {[18, 19, 20, 21].map((h) => (
                  <option key={h} value={h}>
                    {h}:00（閉店後）
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" name="include_admins" defaultChecked={req.includeAdmins} className="w-4 h-4" />
              管理者のアカウントにも出す
            </label>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="section-title">インセンティブの締め日</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-ink-600">
              締め日（対象の月の翌月の）
              <input name="deadline_day" type="number" min={1} max={28} defaultValue={inc.deadlineDay} className="input !min-h-11 !py-2 mt-1" />
            </label>
            <label className="text-xs font-bold text-ink-600">
              何日前から知らせるか
              <input name="reminder_days" type="number" min={0} max={14} defaultValue={inc.reminderDaysBefore} className="input !min-h-11 !py-2 mt-1" />
            </label>
          </div>
          <p className="text-xs font-bold text-ink-600">インセンティブに使う入力</p>
          <div className="flex flex-wrap gap-3">
            {keys.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name={`inc_${k}`} defaultChecked={inc.keys.includes(k)} className="w-4 h-4" />
                {INPUT_DEFS[k].label}
              </label>
            ))}
          </div>
          <Note>締め日のあとに入れたものは使いません（本人が理由を書いて申請し、管理者が承認すれば使います）。基本給など、ほかの給与には影響しません。</Note>
        </section>

        <section className="card space-y-3">
          <h2 className="section-title">予定を確認しないと先に進めない</h2>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="gate_enabled" defaultChecked={gate.enabled} className="w-4 h-4" />
            使う（新しい予定・変更があると、アプリを開いたときに確認の画面が出る）
          </label>
          <label className="text-xs font-bold text-ink-600 block">
            全体スケジュール
            <select name="company_events" defaultValue={gate.companyEvents} className="input !min-h-11 !py-2 mt-1">
              <option value="required">全員参加の予定だけ</option>
              <option value="all">すべての予定</option>
              <option value="off">確認しない</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gate_shift" defaultChecked={gate.myShift} className="w-4 h-4" />
            自分のシフト（公開・変更されたとき）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gate_meetings" defaultChecked={gate.myMeetings} className="w-4 h-4" />
            自分が出る会議（ミーティング）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gate_personal" defaultChecked={gate.personalEvents} className="w-4 h-4" />
            自分の予定に入った面接
          </label>
          <label className="text-xs font-bold text-ink-600 block">
            何日先までの予定を見るか
            <input name="gate_window" type="number" min={7} max={180} defaultValue={gate.windowDays} className="input !min-h-11 !py-2 mt-1" />
          </label>
        </section>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full">
            保存する
          </button>
        </div>
      </form>
      <div className="flex justify-center gap-4 mt-4 text-sm font-bold text-brand-700">
        <Link href="/staff/required" className="underline">
          まだの入力（みんな）
        </Link>
        <Link href="/admin/incentive" className="underline">
          インセンティブの一覧
        </Link>
        <Link href="/staff/confirmations" className="underline">
          予定の確認の記録
        </Link>
      </div>
    </div>
  );
}
