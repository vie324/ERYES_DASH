import { getDataStore } from "@/lib/data";
import { getProductSettings, listProducts, listSuppliers } from "@/lib/orders";
import { products as productsTable } from "@/lib/data/tables";
import { PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { saveProductAction, saveProductSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼15：商品の一覧（依頼7の商品の一覧がまだ無いため、ここで持つ）。原価は管理者だけが見る（この画面は管理者だけ）。
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [list, suppliers, settings] = await Promise.all([listProducts(), listSuppliers(), getProductSettings(db)]);
  const catLabel = (k: string) => settings.categories.find((c) => c.key === k)?.label ?? k;
  const Fields = ({ p }: { p?: (typeof list)[number] }) => (
    <div className="grid grid-cols-2 gap-2">
      <input name="name" defaultValue={p?.name} placeholder="商品名" className="input !min-h-11 !py-2 col-span-2" required />
      <select name="category" defaultValue={p?.category ?? settings.categories[0].key} className="input !min-h-11 !py-2">
        {settings.categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <input name="brand" defaultValue={p?.brand} placeholder="メーカー" className="input !min-h-11 !py-2" />
      <select name="supplier" defaultValue={p?.supplierId ?? ""} className="input !min-h-11 !py-2 col-span-2">
        <option value="">発注先（選ばない）</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {(
        [
          ["retail_price", "店販価格", p?.retailPrice],
          ["staff_price", "社販価格", p?.staffPrice],
          ["cost_price", "原価（管理者だけ）", p?.costPrice],
          ["reorder_point", "この数を下回ったら発注", p?.reorderPoint],
          ["reorder_qty", "発注する数", p?.reorderQty],
          ["sort", "並び順", p?.sortOrder ?? 10],
        ] as const
      ).map(([name, label, value]) => (
        <label key={name} className="text-xs font-bold text-ink-600">
          {label}
          <input name={name} type="number" min={0} defaultValue={value ?? ""} className="input !min-h-11 !py-2 mt-1" />
        </label>
      ))}
      <input name="unit" defaultValue={p?.unit ?? "個"} placeholder="単位（個・本）" className="input !min-h-11 !py-2" />
      <input name="barcode" defaultValue={p?.barcode} placeholder="バーコード（JAN）" inputMode="numeric" className="input !min-h-11 !py-2" />
      <input name="note" defaultValue={p?.note} placeholder="メモ" className="input !min-h-11 !py-2 col-span-2" />
      <label className="flex items-center gap-2 text-sm col-span-2">
        <input type="checkbox" name="inactive" defaultChecked={p ? !p.isActive : false} className="w-4 h-4" />
        使わない
      </label>
    </div>
  );
  return (
    <div className="page-narrow">
      <PageHeader title="商品の一覧" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="layoutGrid" description="発注・社販・在庫で使います" />
      <NotReadyNotice table={productsTable} isAdmin />
      <Flash ok={params.ok} error={params.error} />
      <div className="space-y-2">
        {list.map((p) => (
          <details key={p.id} id={`p-${p.id}`} className="card !p-3.5 scroll-mt-20">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-sm">
              <span className="font-bold flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-xs text-ink-500 shrink-0">{catLabel(p.category)}</span>
              <span className="text-xs text-ink-500 shrink-0">社販 {p.staffPrice.toLocaleString()}円</span>
            </summary>
            <form action={saveProductAction} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <Fields p={p} />
              <button type="submit" className="btn-secondary btn-sm w-full">
                保存
              </button>
            </form>
          </details>
        ))}
        <form action={saveProductAction} className="card !p-3.5 space-y-2 border-dashed">
          <p className="text-sm font-bold">商品を足す</p>
          <Fields />
          <button type="submit" className="btn-primary btn-sm w-full">
            足す
          </button>
        </form>
      </div>
      <form action={saveProductSettingsAction} className="card mt-6 space-y-2">
        <h2 className="section-title">商品の種類</h2>
        <textarea name="categories" rows={5} className="input font-mono !text-sm" defaultValue={settings.categories.map((c) => `${c.key}:${c.label}`).join("\n")} />
        <Note>1行に1つ「キー:表示名」。キー（wig・staff_sale など）は変えないでください。</Note>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="payroll_deduction" defaultChecked={settings.payrollDeduction} className="w-4 h-4" />
          社販・ウィッグの購入を給与から差し引く運用にする（労使協定が要ります。ENiで確認してから）
        </label>
        <button type="submit" className="btn-secondary btn-sm w-full">
          保存
        </button>
      </form>
    </div>
  );
}
