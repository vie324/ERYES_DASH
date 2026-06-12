import { requireAdmin } from "@/lib/auth/session";
import { monthRange, thisMonthJst } from "@/lib/date";
import { PageHeader } from "@/components/ui";

// CSV出力：期間を指定してダウンロード（UTF-8 BOM付き・Excel対応）
export default async function AdminCsvPage() {
  await requireAdmin();
  const { from, to } = monthRange(thisMonthJst());

  const periodFields = (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">開始日</label>
        <input name="from" type="date" defaultValue={from} className="input" required />
      </div>
      <div>
        <label className="label">終了日</label>
        <input name="to" type="date" defaultValue={to} className="input" required />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="CSV出力" backHref="/admin" />

      <section className="card mb-4">
        <h2 className="font-bold text-base mb-1">売上CSV（日報ベース）</h2>
        <p className="text-xs text-stone-500 mb-3">
          項目：日付／スタッフ名／新規人数／既存人数／技術売上／オプション売上／物販売上／合計
        </p>
        {/* GETでAPIルートへ。サーバー側で管理者セッションを確認してCSVを返す */}
        <form action="/api/admin/csv" method="GET" className="space-y-3">
          <input type="hidden" name="type" value="sales" />
          {periodFields}
          <button type="submit" className="btn-primary w-full">
            売上CSVをダウンロード
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-bold text-base mb-1">レジ締め・現金管理CSV</h2>
        <p className="text-xs text-stone-500 mb-3">
          項目：日付／店舗名／現金売上高／レジ現金残高／おつり準備金残高／金庫へ移動額／金庫現金残高／銀行への預入額／メモ
        </p>
        <form action="/api/admin/csv" method="GET" className="space-y-3">
          <input type="hidden" name="type" value="cash" />
          {periodFields}
          <button type="submit" className="btn-primary w-full">
            現金管理CSVをダウンロード
          </button>
        </form>
      </section>

      <div className="text-xs text-stone-500 mt-4 space-y-1">
        {/* TODO: 出力項目は仮。税理士指定の項目を受領したら src/app/api/admin/csv/route.ts を修正する */}
        <p>※ 項目は仮設定です。税理士様の指定項目が決まり次第差し替えます。</p>
        <p>※ Excelでそのまま開けるよう UTF-8（BOM付き）で出力します。</p>
      </div>
    </div>
  );
}
