import { requireAdmin } from "@/lib/auth/session";
import { monthRange, thisMonthJst } from "@/lib/date";
import { PageHeader } from "@/components/ui";

// 売上CSV出力：期間を指定してダウンロード（UTF-8 BOM付き・Excel対応）
export default async function AdminCsvPage() {
  await requireAdmin();
  const { from, to } = monthRange(thisMonthJst());

  return (
    <div>
      <PageHeader title="売上CSV出力" backHref="/admin" />

      <section className="card">
        <h2 className="font-bold text-sm text-stone-500 mb-3">期間を指定してダウンロード</h2>
        {/* GETでAPIルートへ。サーバー側で管理者セッションを確認してCSVを返す */}
        <form action="/api/admin/csv" method="GET" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="from">
                開始日
              </label>
              <input id="from" name="from" type="date" defaultValue={from} className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="to">
                終了日
              </label>
              <input id="to" name="to" type="date" defaultValue={to} className="input" required />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">
            CSVをダウンロード
          </button>
        </form>
        <div className="text-xs text-stone-500 mt-3 space-y-1">
          <p>出力項目：日付／スタッフ名／新規人数／既存人数／技術売上／オプション売上／物販売上／合計</p>
          {/* TODO: 出力項目は仮。税理士指定の項目を受領したら src/app/api/admin/csv/route.ts を修正する */}
          <p>※ 項目は仮設定です。税理士様の指定項目が決まり次第差し替えます。</p>
          <p>※ Excelでそのまま開けるよう UTF-8（BOM付き）で出力します。</p>
        </div>
      </section>
    </div>
  );
}
