// 依頼18：毎日の「発注が必要なもの」の通知（発注先ごとにまとめて、発注の担当の人へ）

import { fx } from "@/lib/data/tables";
import { notifyStaff } from "@/lib/notify";
import { reorderList } from "@/lib/inventory";
import type { JobContext } from "@/lib/jobs/runner";

export async function reorderNotifyJob(ctx: JobContext): Promise<string> {
  const [stores, staff, grants] = await Promise.all([ctx.db.listStores(), ctx.db.listStaff(), fx().staffPermissions.list({ where: { permission: "order_manage" } })]);
  let total = 0;
  for (const store of stores) {
    const needs = await reorderList(store.id);
    if (needs.length === 0) continue;
    total += needs.length;
    // 担当：その店舗の幹部・権限「発注の担当」の人・店舗の管理者（担当店舗）
    const to = staff
      .filter((s) => s.isActive)
      .filter(
        (s) =>
          (s.isExecutive && s.storeId === store.id) ||
          (grants.some((g) => g.staffId === s.id) && s.storeId === store.id) ||
          (s.role === "manager" && s.managedStoreIds.includes(store.id))
      )
      .map((s) => s.id);
    const bySupplier = new Map<string, string[]>();
    for (const n of needs) {
      const key = n.supplier?.name ?? "発注先なし";
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), n.product.name]);
    }
    await notifyStaff(ctx.db, to, {
      kind: "order",
      title: `発注が必要なもの ${needs.length}件（${store.name}）`,
      body: [...bySupplier.entries()].map(([sup, items]) => `${sup}：${items.slice(0, 3).join("・")}${items.length > 3 ? "ほか" : ""}`).join("／"),
      href: `/staff/orders/place?store=${store.id}`,
      refId: `reorder-${store.id}-${ctx.today}`,
      tag: `reorder-${store.id}`,
    });
  }
  return `発注が必要なもの ${total}件`;
}
