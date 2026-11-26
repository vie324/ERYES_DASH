import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { formatDateJa, formatDateTimeJa } from "@/lib/date";
import { canManageOrders, listProducts } from "@/lib/orders";
import { KIND_LABEL, getInventorySettings, movementBreakdown } from "@/lib/inventory";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { BarcodeJump } from "@/components/barcode-input";
import { confirmStocktakeAction, saveCountsAction } from "../actions";

export const dynamic = "force-dynamic";

// 依頼18（95）：棚卸しと照らし合わせ。実際の数を入れると「前回の棚卸し＋入荷−販売−社販−使用−廃棄」の理論上の在庫との差が出る。
// 差が大きいもの（初期値：2個以上か10%以上）を目立たせる。確定した棚卸しは変えられない。差の理由をメモできる。
export default async function StocktakePage({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  if (!(await canManageOrders(v))) redirect("/staff/inventory");
  const params = await searchParams;
  const f = fx();
  const st = params.id ? await f.stocktakes.get(params.id) : null;
  if (!st) notFound();
  if (!v.isAdmin && !(v.isStoreManager && v.me?.managedStoreIds.includes(st.storeId)) && v.me?.storeId !== st.storeId) redirect("/staff/inventory");
  const db = getDataStore();
  const [lines, products, settings, breakdown, stores, staff] = await Promise.all([
    f.stocktakeLines.list({ where: { stocktakeId: st.id } }),
    listProducts(),
    getInventorySettings(db),
    st.status === "draft" ? movementBreakdown(st.storeId) : Promise.resolve(new Map()),
    db.listStores(),
    db.listStaff(),
  ]);
  const draft = st.status === "draft";
  const codes = Object.fromEntries(products.filter((p) => p.barcode).map((p) => [p.barcode, p.id]));
  const big = (theoretical: number, counted: number) => {
    const d = Math.abs(counted - theoretical);
    return d >= settings.diffUnits || (theoretical > 0 && (d / theoretical) * 100 >= settings.diffPercent);
  };
  const rows = lines
    .map((l) => ({ l, p: products.find((p) => p.id === l.productId) }))
    .filter((x) => x.p)
    .sort((a, b) => a.p!.sortOrder - b.p!.sortOrder);
  return (
    <div className="page-narrow">
      <PageHeader title="棚卸し" backHref={`/staff/inventory?store=${st.storeId}`} backLabel="在庫へ戻る" description={`${stores.find((s) => s.id === st.storeId)?.name ?? ""}・${formatDateJa(st.countedOn)}`} />
      <Flash ok={params.ok} error={params.error} />
      {draft ? (
        <Note>実際の数を入れて「保存」。理論上の在庫との差が大きいもの（{settings.diffUnits}個以上か{settings.diffPercent}%以上）が赤く出ます。数え終わったら「確定」。</Note>
      ) : (
        <Note tone="info">確定済み（{st.confirmedAt ? formatDateTimeJa(st.confirmedAt) : ""}・{staff.find((s) => s.id === st.confirmedBy)?.name ?? ""}）。確定した棚卸しは変えられません。</Note>
      )}
      {draft && <div className="mt-3"><BarcodeJump codes={codes} /></div>}
      <form action={saveCountsAction} className="space-y-2 mt-3">
        <input type="hidden" name="id" value={st.id} />
        {rows.map(({ l, p }) => {
          const diff = l.countedSet ? l.counted - l.theoretical : 0;
          const warn = l.countedSet && big(l.theoretical, l.counted);
          const b = breakdown.get(l.productId);
          return (
            <div key={l.id} className={`card !p-3 ${warn ? "!border-red-300 !bg-red-50/50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold flex-1 min-w-0 truncate">{p!.name}</span>
                <span className="text-xs text-ink-500">理論 {l.theoretical}</span>
                <input
                  id={`count-${p!.id}`}
                  name={`count_${l.productId}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  defaultValue={l.countedSet ? l.counted : ""}
                  disabled={!draft}
                  className="input !min-h-10 !py-1.5 w-20 text-right font-bold"
                  aria-label={`${p!.name}の実際の数`}
                />
                <span className={`w-12 text-right text-sm font-bold tabular-nums ${warn ? "text-red-600" : "text-ink-500"}`}>
                  {l.countedSet ? `${diff > 0 ? "+" : ""}${Math.round(diff * 10) / 10}` : "—"}
                </span>
              </div>
              {b && (
                <p className="text-[11px] text-ink-400 mt-1">
                  前回の棚卸しから：{(["receive", "sale", "staff_sale", "use", "waste"] as const).map((k) => `${KIND_LABEL[k]} ${b[k]}`).join("・")}
                </p>
              )}
              {(warn || l.reason) && (
                <input name={`reason_${l.productId}`} defaultValue={l.reason} disabled={!draft} className="input !min-h-9 !py-1 !text-xs mt-2" placeholder="差の理由（例：試供品に使った・割れた）" />
              )}
            </div>
          );
        })}
        {draft && (
          <div className="form-actions grid grid-cols-2 gap-2">
            <button type="submit" className="btn-secondary">
              保存
            </button>
            <ConfirmSubmit
              className="btn-primary"
              formAction={confirmStocktakeAction}
              message="入れた数を保存して確定します。確定すると、この棚卸しは変えられなくなります（数えていない商品は理論上の在庫のまま）。確定しますか？"
            >
              保存して確定
            </ConfirmSubmit>
          </div>
        )}
      </form>
      <p className="text-center mt-4">
        <Link href={`/staff/inventory?store=${st.storeId}`} className="text-sm font-bold text-brand-700 underline">
          在庫へ戻る
        </Link>
      </p>
    </div>
  );
}
