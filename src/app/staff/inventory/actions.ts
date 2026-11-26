"use server";

// 依頼18：在庫の動き（開封1タップ・廃棄・店販の販売）・販売のCSV取り込み・棚卸し

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fx } from "@/lib/data/tables";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { InputError, attempt, num, resultUrl, str } from "@/lib/action-utils";
import { canManageOrders, listProducts } from "@/lib/orders";
import { currentStock, recordMovement } from "@/lib/inventory";
import { parseCsv } from "@/lib/csv-parse";
import { normalizeDate } from "@/lib/sns";
import { todayJst } from "@/lib/date";

function storeAllowed(v: Viewer, storeId: string): boolean {
  if (v.isAdmin) return true;
  if (v.isStoreManager && v.me?.managedStoreIds.includes(storeId)) return true;
  return v.me?.storeId === storeId;
}

/** 開封したら1タップ（業務での使用）。お店のスタッフならだれでも */
export async function useOneAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const kind = str(fd, "kind", 12) === "waste" ? "waste" : str(fd, "kind", 12) === "sale" ? "sale" : "use";
  const r = await attempt(async () => {
    if (!storeAllowed(v, storeId)) throw new InputError("自分の店舗の在庫だけ記録できます");
    if (kind !== "use" && !(await canManageOrders(v))) throw new InputError("廃棄・販売の記録は、幹部・管理者・発注の担当の人です");
    const product = await fx().products.get(str(fd, "product", 80));
    if (!product) throw new InputError("商品が見つかりません");
    const quantity = Math.max(1, num(fd, "quantity", 1));
    await recordMovement({ storeId, productId: product.id, kind, quantity, note: str(fd, "note", 100), createdBy: v.staffId });
    return `${product.name}：${kind === "use" ? "使用" : kind === "waste" ? "廃棄" : "販売"} ${quantity}${product.unit}を記録しました`;
  });
  revalidatePath("/staff/inventory");
  redirect(resultUrl(`/staff/inventory?store=${storeId}`, r));
}

/** 店販の販売のCSV（日付・商品名かバーコード・数）。SalonOne から取れるまでの手段 */
export async function importSalesCsvAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const r = await attempt(async () => {
    if (!storeAllowed(v, storeId) || !(await canManageOrders(v))) throw new InputError("取り込めるのは、幹部・管理者・発注の担当の人です");
    const file = fd.get("csv");
    const text = file instanceof File && file.size > 0 ? await file.text() : str(fd, "csv_text", 200_000);
    const rows = parseCsv(text.replace(/^﻿/, ""));
    if (rows.length < 2) throw new InputError("1行目に見出し（日付,商品,数）、2行目から入れてください");
    const head = rows[0].map((h) => h.trim());
    const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
    const ci = { date: col(["日付", "日"]), product: col(["商品", "品名", "バーコード", "JAN"]), qty: col(["数", "個数", "数量"]) };
    if (ci.product < 0 || ci.qty < 0) throw new InputError("見出しに「商品」と「数」が必要です");
    const products = await listProducts();
    let ok = 0;
    const ng: string[] = [];
    for (const cells of rows.slice(1)) {
      const key = (cells[ci.product] ?? "").trim();
      const qty = Number((cells[ci.qty] ?? "").trim());
      if (!key || !Number.isFinite(qty) || qty <= 0) continue;
      const p = products.find((x) => x.barcode && x.barcode === key.replace(/\s/g, "")) ?? products.find((x) => x.name === key);
      if (!p) {
        ng.push(key);
        continue;
      }
      const date = ci.date >= 0 ? (normalizeDate(cells[ci.date] ?? "") ?? todayJst()) : todayJst();
      await recordMovement({ storeId, productId: p.id, kind: "sale", quantity: qty, occurredOn: date, refType: "csv", createdBy: v.staffId });
      ok++;
    }
    return `${ok}件の販売を取り込みました${ng.length ? `（商品が見つからない：${[...new Set(ng)].slice(0, 5).join("、")}）` : ""}`;
  });
  revalidatePath("/staff/inventory");
  redirect(resultUrl(`/staff/inventory?store=${storeId}`, r));
}

// ---------------------------------------------------------------- 棚卸し

export async function startStocktakeAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  let id = "";
  const r = await attempt(async () => {
    if (!storeAllowed(v, storeId) || !(await canManageOrders(v))) throw new InputError("棚卸しは、幹部・管理者・発注の担当の人が行います");
    const f = fx();
    const draft = await f.stocktakes.find({ storeId, status: "draft" });
    if (draft) {
      id = draft.id;
      return "途中の棚卸しを開きました";
    }
    const st = await f.stocktakes.insert({ storeId, status: "draft", countedOn: todayJst(), startedBy: v.staffId });
    id = st.id;
    const [products, stock] = await Promise.all([listProducts({ activeOnly: true }), currentStock(storeId)]);
    await f.stocktakeLines.insertMany(products.map((p) => ({ stocktakeId: st.id, productId: p.id, theoretical: stock.get(p.id) ?? 0, counted: 0, countedSet: false })));
    return "棚卸しを始めました。実際の数を入れてください";
  });
  redirect(resultUrl(id ? `/staff/inventory/stocktake?id=${id}` : `/staff/inventory?store=${storeId}`, r));
}

/** 入れた数を保存する（保存と確定の両方で使う） */
async function saveCounts(v: Viewer, fd: FormData): Promise<string> {
  const id = str(fd, "id", 80);
  const f = fx();
  const st = await f.stocktakes.get(id);
  if (!st || st.status !== "draft") throw new InputError("確定した棚卸しは変えられません");
  if (!storeAllowed(v, st.storeId) || !(await canManageOrders(v))) throw new InputError("権限がありません");
  const lines = await f.stocktakeLines.list({ where: { stocktakeId: id } });
  // 入れ直すたびに、理論上の在庫もいまの数で出し直す（数えている間の入荷・使用も入るように）
  const stock = await currentStock(st.storeId);
  for (const l of lines) {
    const raw = str(fd, `count_${l.productId}`, 10);
    const reason = str(fd, `reason_${l.productId}`, 200);
    const patch: Partial<typeof l> = { theoretical: stock.get(l.productId) ?? 0, reason: reason || l.reason, updatedAt: new Date() };
    if (raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) Object.assign(patch, { counted: n, countedSet: true });
    }
    await f.stocktakeLines.update(l.id, patch);
  }
  return id;
}

export async function saveCountsAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    await saveCounts(v, fd);
  }, "保存しました");
  redirect(resultUrl(`/staff/inventory/stocktake?id=${id}`, r));
}

/** 確定：これからの在庫は、この数から数える。確定した棚卸しは変えられない */
export async function confirmStocktakeAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    await saveCounts(v, fd);
    const f = fx();
    const st = await f.stocktakes.get(id);
    if (!st || st.status !== "draft") throw new InputError("確定できる棚卸しがありません");
    if (!storeAllowed(v, st.storeId) || !(await canManageOrders(v))) throw new InputError("権限がありません");
    const lines = await f.stocktakeLines.list({ where: { stocktakeId: id } });
    if (!lines.some((l) => l.countedSet)) throw new InputError("実際の数を1つ以上入れてください");
    // 数えなかった商品は、理論上の在庫のまま引き継ぐ
    for (const l of lines.filter((x) => !x.countedSet)) await f.stocktakeLines.update(l.id, { counted: l.theoretical, countedSet: true, reason: l.reason || "数えていない（理論上の在庫のまま）" });
    await f.stocktakes.update(id, { status: "confirmed", confirmedBy: v.staffId, confirmedAt: new Date() });
  }, "棚卸しを確定しました。これからの在庫は、この数から数えます");
  revalidatePath("/staff/inventory");
  redirect(resultUrl(`/staff/inventory/stocktake?id=${id}`, r));
}
