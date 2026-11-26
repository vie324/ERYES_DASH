import { getDataStore } from "@/lib/data";
import { getCashSettings, openStoresOf } from "@/lib/cash";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { saveCashSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼13：レジ締め・現金出納帳の設定（中さんが触って直す前提の試作なので、項目名・摘要の種類をここで変えられる）
export default async function AdminCashPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [settings, stores] = await Promise.all([getCashSettings(db), db.listStores()]);
  const open = openStoresOf(settings, stores);
  const sign = (d: string) => (d === "in" ? "+" : d === "none" ? "0" : "-");
  return (
    <div className="page-narrow">
      <PageHeader title="レジ締めの設定" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="banknote" />
      <Flash ok={params.ok} error={params.error} />
      <form action={saveCashSettingsAction} className="space-y-4">
        <section className="card space-y-3">
          <h2 className="section-title">摘要の種類（現金の出し入れ）</h2>
          <textarea name="kinds" rows={7} className="input font-mono !text-sm" defaultValue={settings.kinds.map((k) => `${k.label},${sign(k.direction)}`).join("\n")} />
          <Note>1行に1つ「名前,+」の形。＋＝入金、−＝出金、0＝出し入れなし（両替など。出納帳に出さない）。</Note>
        </section>
        <section className="card space-y-2">
          <h2 className="section-title">項目名</h2>
          {(
            [
              ["label_change_fund", settings.labels.changeFund, "釣り銭準備金"],
              ["label_cash_sales", settings.labels.cashSales, "現金売上"],
              ["label_counted", settings.labels.counted, "レジの中の現金（数えた合計）"],
              ["label_diff_reason", settings.labels.diffReason, "差額の理由"],
            ] as const
          ).map(([name, value, ph]) => (
            <input key={name} name={name} defaultValue={value} placeholder={ph} className="input !min-h-11 !py-2" />
          ))}
          <label className="text-xs font-bold text-ink-600 block">
            釣り銭準備金の初期値（円）
            <input name="default_change_fund" type="number" min={0} defaultValue={settings.defaultChangeFund} className="input !min-h-11 !py-2 mt-1" />
          </label>
        </section>
        <section className="card space-y-2">
          <h2 className="section-title">入力できる人</h2>
          <Note>入力は店長・副店長（幹部）と管理者、閲覧は管理者です。チェックした店舗は、その店舗の全員が入力できます（初期値：イーリスの店舗＝これまでどおり）。</Note>
          {stores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="open_store" value={s.id} defaultChecked={open.has(s.id)} className="w-4 h-4" />
              {s.name}
            </label>
          ))}
        </section>
        <section className="card space-y-2">
          <h2 className="section-title">現金出納帳の始まり</h2>
          <Note>店舗ごとに「何月から」と「その月のはじめの残高」を入れると、そこから毎月の残高を積み上げます。</Note>
          {stores.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_7rem_7rem] gap-2 items-center">
              <span className="text-sm font-bold truncate">{s.name}</span>
              <input name={`opening_month_${s.id}`} type="month" defaultValue={settings.openings[s.id]?.month ?? ""} className="input !min-h-10 !py-1 !px-2 !text-sm" />
              <input name={`opening_balance_${s.id}`} inputMode="numeric" defaultValue={settings.openings[s.id]?.balance ?? ""} placeholder="残高" className="input !min-h-10 !py-1 !px-2 !text-sm text-right" />
            </div>
          ))}
        </section>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full">
            保存する
          </button>
        </div>
      </form>
    </div>
  );
}
