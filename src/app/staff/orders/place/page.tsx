import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx, purchaseOrders } from "@/lib/data/tables";
import { requireViewer, scopedStores } from "@/lib/viewer";
import { formatDateTimeJa } from "@/lib/date";
import { canManageOrders, listProducts, listSuppliers, safeOrderUrl } from "@/lib/orders";
import { currentStock, reorderList } from "@/lib/inventory";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";
import { cancelOrderAction, placeOrderAction, receiveOrderAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼15：発注画面。商品から1タップで発注先のページを開き、発注した数を記録。届いたら「入荷」。
// 依頼18：在庫が決めた数を下回った商品は「発注が必要なもの」として上に出る（数えて考える作業をなくす）。
export default async function PlaceOrderPage({ searchParams }: { searchParams: Promise<{ store?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  if (!(await canManageOrders(v))) redirect("/staff/orders");
  const params = await searchParams;
  const db = getDataStore();
  const stores = scopedStores(v, await db.listStores());
  const fallback = stores.find((s) => s.id === v.me?.storeId) ?? stores[0];
  const store = stores.find((s) => s.id === params.store) ?? fallback;
  if (!store) redirect("/staff/orders");
  const [products, suppliers, open, stock, needs, staff] = await Promise.all([
    listProducts({ activeOnly: true }),
    listSuppliers({ activeOnly: true }),
    fx().purchaseOrders.list({ where: { storeId: store.id, status: "ordered" }, order: [["orderedAt", "desc"]] }),
    currentStock(store.id),
    reorderList(store.id),
    db.listStaff(),
  ]);
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "";
  const productOf = (id: string) => products.find((p) => p.id === id);
  const groups = [...suppliers.map((s) => ({ supplier: s, items: products.filter((p) => p.supplierId === s.id) })), { supplier: null, items: products.filter((p) => !p.supplierId || !suppliers.some((s) => s.id === p.supplierId)) }].filter((g) => g.items.length > 0);

  return (
    <div className="page-narrow">
      <PageHeader title="発注" backHref="/staff/orders" backLabel="発注・購入へ戻る" icon="banknote" />
      <NotReadyNotice table={purchaseOrders} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      <TabLinks
        items={[
          { href: "/staff/orders/place", label: "発注", active: true },
          { href: "/staff/purchases", label: "ウィッグ・社販の購入", active: false },
          { href: "/staff/orders", label: "申請", active: false },
          { href: "/staff/inventory", label: "在庫・棚卸し", active: false },
        ]}
      />
      {stores.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-3">
          {stores.map((s) => (
            <Link key={s.id} href={`/staff/orders/place?store=${s.id}`} className={`chip shrink-0 ${s.id === store.id ? "chip-active" : ""}`}>
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {needs.length > 0 && (
        <section className="card !border-red-200 !bg-red-50/50 mb-4">
          <h2 className="section-title">発注が必要なもの（在庫が決めた数を下回りました）</h2>
          <ul className="space-y-2">
            {needs.map((n) => (
              <li key={n.product.id} className="rounded-xl bg-white border border-red-100 p-3">
                <p className="text-sm font-bold">
                  {n.product.name}
                  <span className="ml-2 text-xs text-ink-500">
                    在庫 {n.stock} ／ 下回ったら {n.product.reorderPoint}
                  </span>
                </p>
                {/* 幅375pxでもはみ出さないよう、発注先のページへのボタンは1行、数と「発注した」は次の行に */}
                <form action={placeOrderAction} className="flex flex-wrap gap-2 mt-2">
                  <input type="hidden" name="store" value={store.id} />
                  <input type="hidden" name="product" value={n.product.id} />
                  {n.supplier && safeOrderUrl(n.supplier.orderUrl) && (
                    <a href={safeOrderUrl(n.supplier.orderUrl)!} target="_blank" rel="noreferrer" className="btn-secondary btn-sm basis-full truncate">
                      {n.supplier.name}を開く
                    </a>
                  )}
                  <input name="quantity" type="number" min={1} defaultValue={n.suggestQty} className="input !min-h-10 !py-1.5 !w-20 shrink-0 text-right" aria-label="発注する数" />
                  <button type="submit" className="btn-primary btn-sm flex-1 min-w-0">
                    発注した
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (
        <section className="mb-4">
          <h2 className="section-title">入荷待ち</h2>
          <ul className="space-y-2">
            {open.map((o) => (
              <li key={o.id} className="card !p-3.5">
                <p className="text-sm font-bold">
                  {productOf(o.productId)?.name ?? "（消された商品）"} × {o.quantity}
                </p>
                <p className="text-[11px] text-ink-400">
                  {nameOf(o.orderedBy)}・{o.orderedAt ? formatDateTimeJa(o.orderedAt) : ""}
                </p>
                <div className="flex gap-2 mt-2">
                  <form action={receiveOrderAction} className="flex gap-2 flex-1 min-w-0">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="received_qty" type="number" min={0} defaultValue={o.quantity} className="input !min-h-10 !py-1.5 !w-20 shrink-0 text-right" aria-label="届いた数" />
                    <button type="submit" className="btn-primary btn-sm flex-1 min-w-0">
                      入荷
                    </button>
                  </form>
                  <form action={cancelOrderAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <button type="submit" className="btn-ghost !text-xs">
                      取り消し
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="section-title">商品から発注する</h2>
      {groups.length === 0 ? (
        <EmptyState message={v.isAdmin ? "商品がまだありません。管理画面の「商品の一覧」から登録してください" : "商品がまだありません"} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.supplier?.id ?? "none"} className="card !p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-bold flex-1">{g.supplier?.name ?? "発注先なし"}</p>
                {g.supplier && safeOrderUrl(g.supplier.orderUrl) && (
                  <a href={safeOrderUrl(g.supplier.orderUrl)!} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                    <Icon name="link" className="w-3.5 h-3.5" />
                    発注ページを開く
                  </a>
                )}
              </div>
              {g.supplier && (g.supplier.method || g.supplier.deadlineNote) && (
                <p className="text-[11px] text-ink-500 mb-2">
                  {g.supplier.method}
                  {g.supplier.deadlineNote && `・締め：${g.supplier.deadlineNote}`}
                </p>
              )}
              <ul className="divide-y divide-ink-100">
                {g.items.map((p) => (
                  <li key={p.id} className="py-2">
                    <form action={placeOrderAction} className="flex items-center gap-2">
                      <input type="hidden" name="store" value={store.id} />
                      <input type="hidden" name="product" value={p.id} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold truncate">{p.name}</span>
                        <span className="block text-[11px] text-ink-500">在庫 {stock.get(p.id) ?? 0}{p.unit}</span>
                      </span>
                      <input name="quantity" type="number" min={1} defaultValue={p.reorderQty || 1} className="input !min-h-10 !py-1.5 !w-16 shrink-0 text-right" aria-label={`${p.name}の発注する数`} />
                      <button type="submit" className="btn-secondary btn-sm shrink-0">
                        発注した
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
