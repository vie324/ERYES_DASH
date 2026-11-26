import { fx, workImportBatches } from "@/lib/data/tables";
import { formatDateTimeJa } from "@/lib/date";
import { TARGET_LABEL, TEMPLATE_HEAD, frequencyLabel, type Target, type WorkRow } from "@/lib/work-import";
import { PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { applyWorkImportAction, previewWorkImportAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼16：業務の整理の結果をアプリに反映する（管理者だけ）
export default async function WorkImportPage({ searchParams }: { searchParams: Promise<{ batch?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const f = fx();
  const batch = params.batch ? await f.workImportBatches.get(params.batch) : null;
  const rows = (batch?.rows ?? []) as unknown as WorkRow[];
  const summary = batch?.summary as { created?: string[]; nextRequests?: string[]; undecided?: string[] } | undefined;
  const [recent, nextItems] = await Promise.all([
    f.workImportBatches.list({ order: [["createdAt", "desc"]], limit: 5 }),
    f.nextRequestItems.list({ order: [["createdAt", "desc"]], limit: 30 }),
  ]);
  return (
    <div className="page-narrow">
      <PageHeader title="業務の整理の取り込み" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="listTodo" />
      <NotReadyNotice table={workImportBatches} isAdmin />
      <Flash ok={params.ok} error={params.error} />

      {!batch && (
        <form action={previewWorkImportAction} className="card space-y-3">
          <Note>
            宿題シートの「業務の整理」の表を、そのまま貼り付けるか（Excel・スプレッドシートからコピーで可）、CSVで選んでください。
            見出しの例：{TEMPLATE_HEAD.join("・")}（「業務」以外は無くても読めます）。
            「アプリに載せたいか」が○の業務を、ルーティン・単発のタスク・毎日の必須入力・Wiki・次の依頼に当てはめます。まず確認の画面が出ます。
          </Note>
          <input type="file" name="csv" accept=".csv,text/csv,.tsv,.txt" className="block w-full text-sm" />
          <textarea name="text" rows={8} className="input font-mono !text-xs" placeholder={`${TEMPLATE_HEAD.join(",")}\n口コミの返信,店長,毎日見る,店長,Googleの口コミに返信,○,ルーティン,毎日,,代表`} />
          <button type="submit" className="btn-primary w-full">
            読み込んで確認する
          </button>
        </form>
      )}

      {batch && (
        <>
          <p className="text-xs text-ink-500 mb-2">
            {batch.fileName}・{formatDateTimeJa(batch.createdAt)}
            {batch.appliedAt && `・取り込み済み（${formatDateTimeJa(batch.appliedAt)}）`}
          </p>
          {summary?.created ? (
            <div className="space-y-3">
              <section className="card">
                <h2 className="section-title">登録したもの（{summary.created.length}）</h2>
                <ul className="text-sm space-y-0.5">{summary.created.map((c) => <li key={c}>・{c}</li>)}</ul>
              </section>
              <section className="card">
                <h2 className="section-title">次の依頼（今のアプリにない機能）（{summary.nextRequests?.length ?? 0}）</h2>
                <ul className="text-sm space-y-0.5">{(summary.nextRequests ?? []).map((c) => <li key={c}>・{c}</li>)}</ul>
              </section>
              <section className="card !border-amber-200">
                <h2 className="section-title">判断できなかった業務（TODO）（{summary.undecided?.length ?? 0}）</h2>
                <ul className="text-sm space-y-0.5">{(summary.undecided ?? []).map((c) => <li key={c}>・{c}</li>)}</ul>
              </section>
            </div>
          ) : (
            <form action={applyWorkImportAction} className="space-y-3">
              <input type="hidden" name="batch" value={batch.id} />
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>業務</th>
                      <th>当てはめ先</th>
                      <th>担当・頻度</th>
                      <th>気になる所</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line}>
                        <td className="!whitespace-normal min-w-36 font-bold">{r.work}</td>
                        <td>
                          <select name={`target_${r.line}`} defaultValue={r.target} className="input !min-h-9 !py-1 !px-2 !text-xs">
                            {(Object.keys(TARGET_LABEL) as Target[]).map((t) => (
                              <option key={t} value={t}>
                                {TARGET_LABEL[t]}
                              </option>
                            ))}
                          </select>
                          {r.targetGuessed && <span className="block text-[10px] text-ink-400">（自動で推測）</span>}
                        </td>
                        <td className="text-xs">
                          {r.owner || "—"}
                          <span className="block text-ink-500">{frequencyLabel(r.frequency)}{r.due && `・${r.due}まで`}</span>
                        </td>
                        <td className="text-xs text-red-600 !whitespace-normal">{r.issues.join("・")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Note>「気になる所」がある行は登録せず、判断できなかった業務として一覧に残します（担当・頻度を表で直して読み込み直せます）。</Note>
              <ConfirmSubmit className="btn-primary w-full" message="この内容で登録します。よろしいですか？">
                この内容で取り込む
              </ConfirmSubmit>
            </form>
          )}
          <p className="text-center mt-4">
            <a href="/admin/work-import" className="text-sm font-bold text-brand-700 underline">
              別の表を読み込む
            </a>
          </p>
        </>
      )}

      <section className="mt-6">
        <h2 className="section-title">次の依頼（今のアプリにない機能）</h2>
        {nextItems.length === 0 ? (
          <p className="text-sm text-ink-500">まだありません</p>
        ) : (
          <ul className="space-y-1.5">
            {nextItems.map((n) => (
              <li key={n.id} className="card-quiet !p-2.5 text-sm">
                <span className="font-bold">{n.title}</span>
                {n.detail && <span className="block text-xs text-ink-500 whitespace-pre-wrap">{n.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {recent.length > 0 && !batch && (
        <section className="mt-6">
          <h2 className="section-title">これまでの読み込み</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((b) => (
              <li key={b.id}>
                <a href={`/admin/work-import?batch=${b.id}`} className="underline">
                  {formatDateTimeJa(b.createdAt)}・{b.fileName}
                </a>
                {b.appliedAt ? "（取り込み済み）" : "（まだ）"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
