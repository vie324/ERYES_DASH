import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, staffPurchases } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { formatDateJa, todayJst } from "@/lib/date";
import { canManageOrders, listProducts } from "@/lib/orders";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { deletePurchaseAction, recordPurchaseAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼15：ウィッグ・社販の購入記録。本人は自分の履歴だけを見られる（全員分は管理者だけ。/admin/purchases）。
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const [products, mine, staff, canOrder] = await Promise.all([
    listProducts({ activeOnly: true }),
    fx().staffPurchases.list({ where: { staffId: v.staffId }, order: [["purchasedOn", "desc"], ["createdAt", "desc"]], limit: 50 }),
    db.listStaff(),
    canManageOrders(v),
  ]);
  const buyable = products.filter((p) => p.category === "wig" || p.category === "staff_sale" || p.staffPrice > 0);
  const members = staff.filter((s) => s.isActive && (s.id === v.staffId || (v.isExec && canSeeMember(v, s)) || v.isAdmin));
  return (
    <div className="page-narrow">
      <PageHeader title="ウィッグ・社販の購入" backHref="/staff/orders" backLabel="発注・購入へ戻る" icon="banknote" />
      <NotReadyNotice table={staffPurchases} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      <TabLinks
        items={[
          ...(canOrder ? [{ href: "/staff/orders/place", label: "発注", active: false }] : []),
          { href: "/staff/purchases", label: "ウィッグ・社販の購入", active: true },
          { href: "/staff/orders", label: "申請", active: false },
        ]}
      />
      <form action={recordPurchaseAction} className="card space-y-3">
        <p className="section-title !mb-0">買ったものを記録する</p>
        {members.length > 1 && (
          <label className="block text-xs font-bold text-ink-600">
            買った人
            <select name="staff" defaultValue={v.staffId} className="input !min-h-11 !py-2 mt-1">
              {members.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs font-bold text-ink-600">
          商品（社販価格が自動で入ります）
          <select name="product" className="input !min-h-11 !py-2 mt-1" defaultValue={buyable[0]?.id ?? ""}>
            {buyable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.staffPrice.toLocaleString()}円）
              </option>
            ))}
            {(v.isExec || v.isAdmin) && <option value="">一覧にない物（下に品名と金額）</option>}
          </select>
        </label>
        {(v.isExec || v.isAdmin) && (
          <div className="grid grid-cols-2 gap-2">
            <input name="item_name" className="input !min-h-11 !py-2" placeholder="品名（一覧にない物）" />
            <input name="unit_price" inputMode="numeric" className="input !min-h-11 !py-2 text-right" placeholder="1つの値段" />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-bold text-ink-600">
            数
            <input name="quantity" type="number" min={1} defaultValue={1} className="input !min-h-11 !py-2 mt-1" />
          </label>
          <label className="text-xs font-bold text-ink-600 col-span-2">
            日付
            <input name="date" type="date" max={todayJst()} defaultValue={todayJst()} className="input !min-h-11 !py-2 mt-1" />
          </label>
        </div>
        <div className="flex gap-2">
          {(["staff_sale", "wig"] as const).map((c, i) => (
            <label key={c}>
              <input type="radio" name="category" value={c} defaultChecked={i === 0} className="peer sr-only" />
              <span className="chip cursor-pointer">{c === "wig" ? "ウィッグ" : "社販"}</span>
            </label>
          ))}
        </div>
        <ConfirmSubmit className="btn-primary w-full">記録する</ConfirmSubmit>
      </form>
      <h2 className="section-title mt-6">自分の購入履歴</h2>
      {mine.length === 0 ? (
        <EmptyState message="まだ記録はありません" />
      ) : (
        <ul className="space-y-2">
          {mine.map((p) => (
            <li key={p.id} className="card !p-3.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold truncate">
                  {p.itemName} × {p.quantity}
                </span>
                <span className="block text-[11px] text-ink-500">
                  {formatDateJa(p.purchasedOn)}・{p.category === "wig" ? "ウィッグ" : "社販"}
                </span>
              </span>
              <span className="font-bold tabular-nums">{p.total.toLocaleString()}円</span>
              {(v.isAdmin || p.recordedBy === v.staffId) && (
                <form action={deletePurchaseAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit className="text-xs text-red-500 underline" message="この記録を消しますか？">
                    消す
                  </ConfirmSubmit>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {v.isAdmin && (
        <p className="text-center mt-4">
          <Link href="/admin/purchases" className="text-sm font-bold text-brand-700 underline">
            全員の月ごとの合計（管理者だけ）
          </Link>
        </p>
      )}
    </div>
  );
}
