// 依頼18：在庫・棚卸しの照らし合わせ・発注の自動化（依頼15の発注・購入の記録を使う）。
//  ・店舗ごと・商品ごとに在庫を持つ。増える＝入荷（依頼15の「入荷」）。減る＝店販の販売・社販・業務での使用・廃棄
//  ・在庫の数 ＝ 最後に確定した棚卸しの数 ＋ それより後の動き（棚卸しをまだしていない商品は、はじめからの動き）
//  ・店販の販売数は、2027年1月から SalonOne の会計を取り込む（それまではCSVか手入力）
//  ・業務での使用は、まず「開封したら1タップ」で記録する
//  ・決めた数（reorderPoint）を下回った商品は「発注が必要なもの」として毎日リストにする

import { fx } from "@/lib/data/tables";
import type { InventoryKind, InventoryMovement, Product, Stocktake, Supplier } from "@/lib/data/tables";
import { addDays, todayJst } from "@/lib/date";
import { listProducts, listSuppliers } from "@/lib/orders";
import { readJsonSetting } from "@/lib/feature-settings";
import type { DataStore } from "@/lib/data/types";

export const KIND_LABEL: Record<InventoryKind, string> = {
  receive: "入荷",
  sale: "店販の販売",
  staff_sale: "社販",
  use: "業務で使用",
  waste: "廃棄",
  adjust: "棚卸しの調整",
};

/** 在庫に対する向き（入荷は＋、販売・社販・使用・廃棄は−。調整は符号つきの数そのまま） */
export function signedQuantity(m: Pick<InventoryMovement, "kind" | "quantity">): number {
  if (m.kind === "receive") return m.quantity;
  if (m.kind === "adjust") return m.quantity;
  return -m.quantity;
}

export const INVENTORY_SETTINGS_KEY = "inventory_settings";
export interface InventorySettings {
  /** 棚卸しの差を目立たせる：何個以上 */
  diffUnits: number;
  /** 棚卸しの差を目立たせる：何％以上 */
  diffPercent: number;
  /** 発注が必要なものの通知の時刻 */
  notifyHour: number;
}
export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = { diffUnits: 2, diffPercent: 10, notifyHour: 10 };
export async function getInventorySettings(db: DataStore): Promise<InventorySettings> {
  return readJsonSetting(db, INVENTORY_SETTINGS_KEY, DEFAULT_INVENTORY_SETTINGS);
}

/** 店舗の、最後に確定した棚卸し */
export async function lastConfirmedStocktake(storeId: string): Promise<Stocktake | null> {
  const rows = await fx().stocktakes.list({ where: { storeId, status: "confirmed" }, order: [["confirmedAt", "desc"]], limit: 1 });
  return rows[0] ?? null;
}

/**
 * 理論上の在庫（商品ID → 数）。最後に確定した棚卸しの数に、それより後の動きを足し引きする。
 * at を渡すと、その時点までの動きだけで数える（棚卸しの照らし合わせに使う）。
 */
export async function currentStock(storeId: string, at?: Date): Promise<Map<string, number>> {
  const f = fx();
  const base = await lastConfirmedStocktake(storeId);
  const lines = base ? await f.stocktakeLines.list({ where: { stocktakeId: base.id } }) : [];
  const since = base?.confirmedAt ?? null;
  const movements = await f.inventoryMovements.list({
    where: { storeId, ...(since ? { createdAt: { gt: since, ...(at ? { lte: at } : {}) } } : at ? { createdAt: { lte: at } } : {}) },
  });
  const stock = new Map<string, number>();
  for (const l of lines) if (l.countedSet) stock.set(l.productId, l.counted);
  for (const m of movements) stock.set(m.productId, (stock.get(m.productId) ?? 0) + signedQuantity(m));
  return stock;
}

/** 前回の棚卸しから今までの動きを、種類ごとに数える（照らし合わせの表に使う） */
export async function movementBreakdown(storeId: string, productId?: string): Promise<Map<string, Record<InventoryKind, number>>> {
  const base = await lastConfirmedStocktake(storeId);
  const movements = await fx().inventoryMovements.list({
    where: { storeId, ...(productId ? { productId } : {}), ...(base?.confirmedAt ? { createdAt: { gt: base.confirmedAt } } : {}) },
  });
  const out = new Map<string, Record<InventoryKind, number>>();
  for (const m of movements) {
    const row = out.get(m.productId) ?? { receive: 0, sale: 0, staff_sale: 0, use: 0, waste: 0, adjust: 0 };
    row[m.kind] += m.quantity;
    out.set(m.productId, row);
  }
  return out;
}

export interface ReorderNeed {
  product: Product;
  supplier: Supplier | null;
  stock: number;
  /** 発注する数の目安（決めた数。決めていなければ下回った分） */
  suggestQty: number;
}

/** 発注が必要なもの：在庫が決めた数を下回り、まだ入荷待ちの発注が無い商品 */
export async function reorderList(storeId: string): Promise<ReorderNeed[]> {
  const [products, suppliers, stock, open] = await Promise.all([
    listProducts({ activeOnly: true }),
    listSuppliers(),
    currentStock(storeId),
    fx().purchaseOrders.list({ where: { storeId, status: "ordered" } }),
  ]);
  const waiting = new Set(open.map((o) => o.productId));
  return products
    .filter((p) => p.reorderPoint > 0 && (stock.get(p.id) ?? 0) < p.reorderPoint && !waiting.has(p.id))
    .map((p) => ({
      product: p,
      supplier: suppliers.find((s) => s.id === p.supplierId) ?? null,
      stock: stock.get(p.id) ?? 0,
      suggestQty: p.reorderQty > 0 ? p.reorderQty : Math.max(1, p.reorderPoint - (stock.get(p.id) ?? 0)),
    }));
}

/**
 * 過去の使用量から「これを下回ったら発注する数」を提案する（データがたまったら）。
 * 1日あたりの出ていく数 × （届くまでの日数＋7日のゆとり）。28日ぶんの記録が無ければ提案しない。
 */
export async function suggestReorderPoint(storeId: string, product: Product, leadDays: number): Promise<number | null> {
  const from = addDays(todayJst(), -56);
  const out = await fx().inventoryMovements.list({ where: { storeId, productId: product.id, occurredOn: { gte: from } } });
  const used = out.filter((m) => m.kind !== "receive" && m.kind !== "adjust");
  if (used.length < 3) return null;
  const days = Math.max(28, Math.round((Date.now() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000));
  const perDay = used.reduce((s, m) => s + m.quantity, 0) / days;
  return Math.max(1, Math.ceil(perDay * (Math.max(1, leadDays) + 7)));
}

/** 在庫の動きを記録する（使用・廃棄・販売・社販） */
export async function recordMovement(input: {
  storeId: string;
  productId: string;
  kind: InventoryKind;
  quantity: number;
  occurredOn?: string;
  refType?: string;
  refId?: string;
  note?: string;
  createdBy: string | null;
}): Promise<InventoryMovement> {
  return fx().inventoryMovements.insert({
    storeId: input.storeId,
    productId: input.productId,
    kind: input.kind,
    quantity: input.quantity,
    occurredOn: input.occurredOn ?? todayJst(),
    refType: input.refType ?? "",
    refId: input.refId ?? "",
    note: input.note ?? "",
    createdBy: input.createdBy,
  });
}
