import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx, inventoryMovements } from "@/lib/data/tables";
import { requireViewer, scopedStores } from "@/lib/viewer";
import { formatDateJa, formatDateTimeJa } from "@/lib/date";
import { canManageOrders, getProductSettings, listProducts } from "@/lib/orders";
import { KIND_LABEL, currentStock, lastConfirmedStocktake, reorderList, signedQuantity } from "@/lib/inventory";
import { isSalonOneConfigured } from "@/lib/salonone";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { importSalesCsvAction, startStocktakeAction, useOneAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼18：在庫（店舗ごと・商品ごと）。開封したら1タップで「使用」を記録。発注が必要なものは発注の画面へ。
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ store?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const all = await db.listStores();
  const stores = v.isAdmin || v.isStoreManager ? scopedStores(v, all) : all.filter((s) => s.id === v.me?.storeId);
  const store = stores.find((s) => s.id === params.store) ?? stores.find((s) => s.id === v.me?.storeId) ?? stores[0];
  if (!store) redirect("/staff");
  const manage = await canManageOrders(v);
  const [products, stock, needs, last, recent, settings, staff] = await Promise.all([
    listProducts({ activeOnly: true }),
    currentStock(store.id),
    manage ? reorderList(store.id) : Promise.resolve([]),
    lastConfirmedStocktake(store.id),
    fx().inventoryMovements.list({ where: { storeId: store.id }, order: [["createdAt", "desc"]], limit: 15 }),
    getProductSettings(db),
    db.listStaff(),
  ]);
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "（使わない商品）";
  const catLabel = (k: string) => settings.categories.find((c) => c.key === k)?.label ?? k;
  return (
    <div className="page-narrow">
      <PageHeader title="在庫・棚卸し" backHref="/staff" icon="layoutGrid" />
      <NotReadyNotice table={inventoryMovements} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      {manage && (
        <TabLinks
          items={[
            { href: "/staff/orders/place", label: "発注", active: false, badge: needs.length },
            { href: "/staff/purchases", label: "ウィッグ・社販の購入", active: false },
            { href: "/staff/inventory", label: "在庫・棚卸し", active: true },
          ]}
        />
      )}
      {stores.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-3">
          {stores.map((s) => (
            <Link key={s.id} href={`/staff/inventory?store=${s.id}`} className={`chip shrink-0 ${s.id === store.id ? "chip-active" : ""}`}>
              {s.name}
            </Link>
          ))}
        </div>
      )}
      {manage && needs.length > 0 && (
        <Link href={`/staff/orders/place?store=${store.id}`} className="card !p-3.5 mb-3 flex items-center gap-3 !border-red-200 !bg-red-50/60">
          <span className="text-sm font-bold text-red-700 flex-1">発注が必要なもの {needs.length}件</span>
          <span className="text-xs font-bold text-red-700">発注の画面へ ›</span>
        </Link>
      )}
      {manage && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <form action={startStocktakeAction}>
            <input type="hidden" name="store" value={store.id} />
            <button type="submit" className="btn-primary w-full !text-sm">
              棚卸しをする
            </button>
          </form>
          <p className="text-[11px] text-ink-500 self-center">前回の棚卸し：{last ? formatDateJa(last.countedOn) : "まだ（はじめからの動きで数えています）"}</p>
        </div>
      )}

      <h2 className="section-title">在庫（開封したら「使った」を1タップ）</h2>
      {products.length === 0 ? (
        <EmptyState message="商品がまだありません（管理画面の「商品の一覧」で登録）" />
      ) : (
        <ul className="ios-list border border-brand-100">
          {products.map((p) => {
            const n = stock.get(p.id) ?? 0;
            const low = p.reorderPoint > 0 && n < p.reorderPoint;
            return (
              <li key={p.id} className="ios-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold truncate">{p.name}</span>
                  <span className="block text-[12px] ios-secondary">
                    {catLabel(p.category)}・在庫 <span className={low ? "font-bold text-red-600" : "font-bold"}>{n}</span>
                    {p.unit}
                    {p.reorderPoint > 0 && `（${p.reorderPoint}を下回ったら発注）`}
                  </span>
                </span>
                <form action={useOneAction}>
                  <input type="hidden" name="store" value={store.id} />
                  <input type="hidden" name="product" value={p.id} />
                  <input type="hidden" name="kind" value="use" />
                  <button type="submit" className="btn-secondary btn-sm">
                    使った −1
                  </button>
                </form>
                {manage && (
                  <form action={useOneAction}>
                    <input type="hidden" name="store" value={store.id} />
                    <input type="hidden" name="product" value={p.id} />
                    <input type="hidden" name="kind" value="waste" />
                    <button type="submit" className="btn-ghost !text-xs !px-2">
                      廃棄
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {manage && (
        <form action={importSalesCsvAction} className="card space-y-2 mt-5">
          <h2 className="section-title !mb-0">店販の販売を取り込む（CSV）</h2>
          <Note>
            {isSalonOneConfigured()
              ? "SalonOne の会計データから毎日取り込みます。足りない分はここから入れられます。"
              : "2027年1月から SalonOne の会計データを取り込みます。それまでは、見出し「日付,商品,数」のCSV（商品は名前かバーコード）で入れてください。"}
          </Note>
          <input type="hidden" name="store" value={store.id} />
          <input type="file" name="csv" accept=".csv,text/csv" className="block w-full text-sm" />
          <textarea name="csv_text" rows={3} className="input !text-xs font-mono" placeholder={"日付,商品,数\n2026/11/25,ENi シャンプー 300ml,2"} />
          <button type="submit" className="btn-secondary btn-sm w-full">
            取り込む
          </button>
        </form>
      )}

      <h2 className="section-title mt-5">最近の動き</h2>
      <ul className="space-y-1 text-sm">
        {recent.map((m) => (
          <li key={m.id} className="flex gap-2">
            <span className="w-20 text-ink-500 text-xs">{formatDateTimeJa(m.createdAt).slice(0, 10)}</span>
            <span className="flex-1 truncate">
              {productName(m.productId)}：{KIND_LABEL[m.kind]}
            </span>
            <span className={`tabular-nums font-bold ${signedQuantity(m) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {signedQuantity(m) > 0 ? "+" : ""}
              {signedQuantity(m)}
            </span>
            <span className="text-[11px] text-ink-400 w-16 truncate">{nameOf(m.createdBy)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-400 mt-3">
        次の段階の提案：メニューごとの使用量（例：カラー1回＝カラー剤1本）を決めておくと、SalonOne の会計から自動で「使用」を引けます。
      </p>
    </div>
  );
}
