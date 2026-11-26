// 依頼15：発注画面と、ウィッグ・社販の購入記録（依頼18の在庫・発注の自動化でも使う）。
//  ・発注先の一覧（名前・発注ページのURL・連絡先・発注の方法・締め日など）は管理画面で登録
//  ・商品（依頼7の商品の一覧がまだ無いため、ここで持つ）ごとに発注先をひもづけ、発注画面から1タップで発注先のページへ
//  ・発注の記録：誰が・いつ・何を・いくつ。届いたら「入荷」（在庫が増える。依頼18）
//  ・ウィッグ・社販の購入記録：誰が・いつ・何を・いくつ・いくらで（社販価格は商品の一覧から自動で入る）。
//    月ごとに人別の合計をCSVで書き出せる。本人は自分の履歴だけ、全員分は管理者だけが見られる
//  ・原価は管理者だけが見る（CLAUDE.md：原価・仕入率は管理者の2名だけ）

import { fx } from "@/lib/data/tables";
import type { Product, StaffPurchase, Supplier } from "@/lib/data/tables";
import { monthRange } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { staffHasPermission } from "@/lib/permissions";
import type { Viewer } from "@/lib/viewer";
import type { DataStore } from "@/lib/data/types";

export const PRODUCT_SETTINGS_KEY = "product_settings";
export interface ProductSettings {
  categories: { key: string; label: string }[];
  /** 社販・ウィッグの購入を「給与から差し引く」運用にするか（労使協定が要る。ENiで確認。TODO） */
  payrollDeduction: boolean;
}
export const DEFAULT_PRODUCT_SETTINGS: ProductSettings = {
  categories: [
    { key: "retail", label: "店販" },
    { key: "material", label: "商材（カラー剤・シャンプーなど）" },
    { key: "wig", label: "ウィッグ" },
    { key: "staff_sale", label: "社販の商品" },
    { key: "other", label: "そのほか" },
  ],
  payrollDeduction: false,
};

export async function getProductSettings(db: DataStore): Promise<ProductSettings> {
  const s = await readJsonSetting(db, PRODUCT_SETTINGS_KEY, DEFAULT_PRODUCT_SETTINGS);
  if (s.categories.length === 0) s.categories = DEFAULT_PRODUCT_SETTINGS.categories;
  return s;
}

/** 発注・入荷を記録できるか（幹部・管理者・店舗の管理者・権限「発注の担当」の人） */
export async function canManageOrders(v: Viewer): Promise<boolean> {
  if (v.isAdmin || v.isExec || v.isStoreManager) return true;
  return staffHasPermission(v.me, "order_manage");
}

export async function listSuppliers(opts: { activeOnly?: boolean } = {}): Promise<Supplier[]> {
  const rows = await fx().suppliers.list({ order: [["sortOrder", "asc"], ["name", "asc"]] });
  return opts.activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export async function listProducts(opts: { activeOnly?: boolean } = {}): Promise<Product[]> {
  const rows = await fx().products.list({ order: [["category", "asc"], ["sortOrder", "asc"], ["name", "asc"]] });
  return opts.activeOnly ? rows.filter((r) => r.isActive) : rows;
}

/** 画面に出す商品（原価は管理者だけ。ほかの人の画面・データには原価を入れない） */
export function productForViewer(p: Product, isAdmin: boolean): Product {
  return isAdmin ? p : { ...p, costPrice: 0 };
}

/** 発注先のページを開くURL（http(s) だけ） */
export function safeOrderUrl(url: string): string | null {
  return /^https?:\/\/\S+$/.test(url) ? url : null;
}

/** 月の、人ごとのウィッグ・社販の合計 */
export async function purchaseSummary(month: string): Promise<{ rows: StaffPurchase[]; byStaff: Map<string, { count: number; total: number }> }> {
  const { from, to } = monthRange(month);
  const rows = await fx().staffPurchases.list({ where: { purchasedOn: { gte: from, lte: to } }, order: [["purchasedOn", "asc"]] });
  const byStaff = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const cur = byStaff.get(r.staffId) ?? { count: 0, total: 0 };
    cur.count += r.quantity;
    cur.total += r.total;
    byStaff.set(r.staffId, cur);
  }
  return { rows, byStaff };
}
