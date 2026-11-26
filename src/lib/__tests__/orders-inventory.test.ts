// 依頼15：発注・購入の記録／依頼18：在庫・棚卸し・発注の自動化
import { describe, expect, it } from "vitest";
import { fx } from "@/lib/data/tables";
import { listProducts, productForViewer, purchaseSummary, safeOrderUrl } from "@/lib/orders";
import { currentStock, reorderList, recordMovement, signedQuantity } from "@/lib/inventory";
import { thisMonthJst } from "@/lib/date";

describe("発注画面と購入の記録（15）", () => {
  it("原価は管理者にだけ見せる", async () => {
    const p = (await listProducts())[0];
    expect(p.costPrice).toBeGreaterThan(0);
    expect(productForViewer(p, false).costPrice).toBe(0);
    expect(productForViewer(p, true).costPrice).toBe(p.costPrice);
  });

  it("発注先のページは http(s) のURLだけ開く", () => {
    expect(safeOrderUrl("https://example.com/order")).toBe("https://example.com/order");
    expect(safeOrderUrl("javascript:alert(1)")).toBeNull();
  });

  it("ウィッグ・社販は人ごとに月の合計が出る", async () => {
    const { byStaff } = await purchaseSummary(thisMonthJst());
    const total = [...byStaff.values()].reduce((s, v) => s + v.total, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("在庫（18）", () => {
  it("入荷で増え、販売・社販・使用・廃棄で減る", async () => {
    expect(signedQuantity({ kind: "receive", quantity: 3 })).toBe(3);
    expect(signedQuantity({ kind: "use", quantity: 1 })).toBe(-1);
    const p = (await listProducts()).find((x) => x.name.startsWith("ENi シャンプー"))!;
    const before = (await currentStock("store-4")).get(p.id) ?? 0;
    await recordMovement({ storeId: "store-4", productId: p.id, kind: "waste", quantity: 1, createdBy: "staff-3" });
    expect((await currentStock("store-4")).get(p.id)).toBe(before - 1);
  });

  it("決めた数を下回り、入荷待ちの発注が無い商品が「発注が必要なもの」に出る", async () => {
    const needs = await reorderList("store-4");
    const names = needs.map((n) => n.product.name);
    // シャンプーは 10−6−1=3本 < 5本。トリートメントは入荷待ちの発注があるので出ない
    expect(names).toContain("ENi シャンプー 300ml");
    expect(names).not.toContain("ENi トリートメント 250g");
    const open = await fx().purchaseOrders.list({ where: { status: "ordered" } });
    expect(open.length).toBeGreaterThan(0);
  });
});
