import { redirect } from "next/navigation";
import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { addMonths, formatDateTimeJa, formatMonthJa, thisMonthJst } from "@/lib/date";
import { getSnsSettings } from "@/lib/sns";
import { ensureAward } from "@/lib/sns/award";
import { isMonth } from "@/lib/action-utils";
import { thanksAwards } from "@/lib/data/tables";
import { MonthNav, PageHeader, EmptyState } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { announceAwardAction, recountAwardAction } from "../actions";

export const dynamic = "force-dynamic";

// 月間サンクス表彰（管理者だけ）。毎月1日に前月分が自動で集計され、ここで受賞者を選んで発表する。
// 候補の一覧（順位）は管理者だけが見る。発表すると、選んだ受賞者だけが全体共有ルームとタイムラインに出る。
export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; ok?: string; error?: string }>;
}) {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/staff/sns");
  const params = await searchParams;
  const db = getDataStore();
  const month = isMonth(params.month ?? "") ? params.month! : addMonths(thisMonthJst(), -1);
  const [award, staff, settings] = await Promise.all([ensureAward(db, month), db.listStaff(), getSnsSettings(db)]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "（退職したスタッフ）";

  return (
    <div className="page-narrow">
      <PageHeader title="月間サンクス表彰" backHref="/staff/sns" backLabel="社内SNSへ戻る" description="管理者だけが見られます" icon="crown" />
      <NotReadyNotice table={thanksAwards} isAdmin />
      <Flash ok={params.ok} error={params.error} />
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/sns/awards?month=${addMonths(month, -1)}`}
        nextHref={`/staff/sns/awards?month=${addMonths(month, 1)}`}
      />

      {award.status === "announced" ? (
        <div className="card space-y-2">
          <p className="text-sm font-bold text-emerald-700">発表済み（{award.announcedAt ? formatDateTimeJa(award.announcedAt) : ""}）</p>
          {award.winners.map((w) => (
            <p key={w.staffId} className="text-sm">
              🏆 <span className="font-bold">{w.title}</span>：{nameOf(w.staffId)}さん
            </p>
          ))}
          {award.postId && (
            <Link href={`/staff/sns/post/${award.postId}`} className="text-sm font-bold text-brand-700 underline">
              タイムラインの投稿を見る
            </Link>
          )}
        </div>
      ) : (
        <>
          <Note>
            毎月1日に前月分を自動で集計します（もらった数・送った数・ポイント。非公開のサンクスも数に入れます）。
            受賞者にチェックを入れ、賞の名前とひとことを書いて「発表する」を押すと、全体共有ルームとタイムラインに出ます。
            候補の順位は発表しません。
            {award.computedAt && <span className="block mt-1">集計：{formatDateTimeJa(award.computedAt)}</span>}
          </Note>
          <form action={recountAwardAction} className="mt-2 mb-4 text-right">
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="btn-ghost !text-xs">
              数え直す
            </button>
          </form>
          {award.candidates.length === 0 ? (
            <EmptyState message="この月のサンクスはまだありません" />
          ) : (
            <form action={announceAwardAction} className="space-y-3">
              <input type="hidden" name="month" value={month} />
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>名前</th>
                      <th className="text-right">もらった</th>
                      <th className="text-right">送った</th>
                      <th className="text-right">もらったpt</th>
                      <th className="text-right">送ったpt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {award.candidates.map((c) => (
                      <tr key={c.staffId}>
                        <td className="font-bold">{nameOf(c.staffId)}</td>
                        <td className="text-right tabular-nums">{c.received}</td>
                        <td className="text-right tabular-nums">{c.sent}</td>
                        <td className="text-right tabular-nums">{c.pointsReceived}</td>
                        <td className="text-right tabular-nums">{c.pointsSent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 className="section-title !mt-5">受賞者を選ぶ</h2>
              <div className="space-y-2">
                {award.candidates.slice(0, 15).map((c) => (
                  <div key={c.staffId} className="card !p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input type="checkbox" name="winner" value={c.staffId} className="w-4 h-4" />
                      {nameOf(c.staffId)}
                      <span className="text-xs font-normal text-ink-500">（もらった {c.received}・送った {c.sent}）</span>
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select name={`title_${c.staffId}`} className="input !min-h-11 !py-2 !text-sm" defaultValue={settings.awardTitles[0]}>
                        {settings.awardTitles.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <input name={`comment_${c.staffId}`} className="input !min-h-11 !py-2 !text-sm" placeholder="ひとこと（任意）" maxLength={300} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="label" htmlFor="award-message">
                  みんなへのメッセージ（任意）
                </label>
                <textarea id="award-message" name="message" rows={3} className="input min-h-20" maxLength={1000} />
              </div>
              <div className="form-actions">
                <ConfirmSubmit className="btn-primary w-full" message="選んだ受賞者を、全体共有ルームとタイムラインに発表します。よろしいですか？">
                  発表する
                </ConfirmSubmit>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
