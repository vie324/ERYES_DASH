import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, thanksExtras } from "@/lib/data/tables";
import { getSnsSettings } from "@/lib/sns";
import { PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { importThanksCsvAction, saveSnsSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼10：社内SNSの設定（管理者だけ。admin/layout.tsx で管理者に限っている）
export default async function AdminSnsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [settings, imported] = await Promise.all([getSnsSettings(db), fx().thanksExtras.count({ source: "import" })]);
  return (
    <div className="page-narrow">
      <PageHeader title="社内SNSの設定" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="heart" />
      <NotReadyNotice table={thanksExtras} isAdmin />
      <Flash ok={params.ok} error={params.error} />

      <form action={saveSnsSettingsAction} className="card space-y-4">
        <h2 className="section-title">選択肢と文言</h2>
        <div>
          <label className="label" htmlFor="categories">
            いい事例のカテゴリ（1行に1つ）
          </label>
          <textarea id="categories" name="categories" rows={5} className="input" defaultValue={settings.categories.join("\n")} />
        </div>
        <div>
          <label className="label" htmlFor="stamps">
            サンクスのスタンプ（1行に1つ・絵文字）
          </label>
          <textarea id="stamps" name="stamps" rows={4} className="input" defaultValue={settings.stamps.join("\n")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="monthly_points">
              1人が毎月使えるポイント
            </label>
            <input id="monthly_points" name="monthly_points" type="number" min={0} className="input" defaultValue={settings.monthlyPoints} />
          </div>
          <div>
            <label className="label" htmlFor="max_points">
              1回に添えられる上限
            </label>
            <input id="max_points" name="max_points" type="number" min={0} className="input" defaultValue={settings.maxPointsPerThanks} />
          </div>
        </div>
        <Note>ポイントは「記録して見えるようにする」だけです。お金や商品との交換の仕組みは作っていません（交換の扱いはENiで決めます）。</Note>
        <div>
          <label className="label" htmlFor="post_notice">
            投稿画面の注意書き
          </label>
          <textarea id="post_notice" name="post_notice" rows={3} className="input" defaultValue={settings.postNotice} />
        </div>
        <div>
          <label className="label" htmlFor="award_titles">
            月間サンクス表彰の賞の名前（1行に1つ）
          </label>
          <textarea id="award_titles" name="award_titles" rows={3} className="input" defaultValue={settings.awardTitles.join("\n")} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full">
            保存する
          </button>
        </div>
      </form>

      <form action={importThanksCsvAction} className="card space-y-3 mt-4">
        <h2 className="section-title">昔のサンクスカードの取り込み</h2>
        <p className="text-sm text-ink-600 leading-relaxed">
          アプリの中のサンクスカード（これまでの「サンクスカード」画面で送ったもの）は、そのまま社内SNSの「サンクス」に出ています。
          アプリの外（紙・別のサービス）にあったカードは、CSVで取り込めます。いまの取り込み済み：{imported}件
        </p>
        <Note>
          1行目に見出し「日付,送った人,もらった人,メッセージ」を入れてください（列の順番は自由）。名前はスタッフの名前（空白は無視）か呼び名と照合し、
          一致しない人は名前のまま残します。同じ内容のカードは2回入りません。消すことはしません。
        </Note>
        <input type="file" name="csv" accept=".csv,text/csv" className="block w-full text-sm" />
        <textarea name="csv_text" rows={4} className="input !text-sm" placeholder={"または、ここに貼り付け\n日付,送った人,もらった人,メッセージ\n2026/10/01,山本 大輝,小林 蒼,いつもありがとう"} />
        <ConfirmSubmit className="btn-secondary w-full" pendingLabel="取り込んでいます…">
          取り込む
        </ConfirmSubmit>
      </form>

      <p className="text-center mt-4">
        <Link href="/staff/sns/awards" className="text-sm font-bold text-brand-700 underline">
          月間サンクス表彰の画面へ
        </Link>
      </p>
    </div>
  );
}
