"use server";

// 依頼15：発注と入荷の記録（幹部・管理者・店舗の管理者・発注の担当）。入荷すると在庫が増える（依頼18）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeStore } from "@/lib/viewer";
import { InputError, attempt, int, resultUrl, str } from "@/lib/action-utils";
import { canManageOrders } from "@/lib/orders";
import { todayJst } from "@/lib/date";

const BACK = "/staff/orders/place";

export async function placeOrderAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const r = await attempt(async () => {
    if (!(await canManageOrders(v))) throw new InputError("発注を記録できるのは、幹部・管理者・発注の担当の人です");
    if (!canSeeStore(v, storeId) && !(v.me?.storeId === storeId)) throw new InputError("この店舗の発注は記録できません");
    const product = await fx().products.get(str(fd, "product", 80));
    if (!product) throw new InputError("商品を選んでください");
    const quantity = int(fd, "quantity", 0);
    if (quantity <= 0 || quantity > 9999) throw new InputError("数を入れてください");
    await fx().purchaseOrders.insert({
      storeId,
      productId: product.id,
      supplierId: product.supplierId,
      quantity,
      status: "ordered",
      orderedBy: v.staffId,
      orderedAt: new Date(),
      note: str(fd, "note", 200),
    });
    return `${product.name}を${quantity}${product.unit}発注したと記録しました`;
  });
  revalidatePath(BACK);
  redirect(resultUrl(`${BACK}?store=${storeId}`, r));
}

/** 入荷：届いた数を在庫に足す（入荷の数が発注と違うときは、届いた数で） */
export async function receiveOrderAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  let storeId = "";
  const r = await attempt(async () => {
    if (!(await canManageOrders(v))) throw new InputError("入荷を記録できるのは、幹部・管理者・発注の担当の人です");
    const f = fx();
    const order = await f.purchaseOrders.get(id);
    if (!order || order.status !== "ordered") throw new InputError("入荷待ちの発注が見つかりません");
    storeId = order.storeId;
    const qty = Math.max(0, int(fd, "received_qty", order.quantity));
    await f.purchaseOrders.update(id, { status: "received", receivedBy: v.staffId, receivedAt: new Date(), receivedQty: qty });
    if (qty > 0) {
      await f.inventoryMovements.insert({
        storeId: order.storeId,
        productId: order.productId,
        kind: "receive",
        quantity: qty,
        occurredOn: todayJst(),
        refType: "purchase_order",
        refId: order.id,
        createdBy: v.staffId,
      });
    }
    return `入荷を記録しました（在庫に${qty}足しました）`;
  });
  revalidatePath(BACK);
  revalidatePath("/staff/inventory");
  redirect(resultUrl(`${BACK}${storeId ? `?store=${storeId}` : ""}`, r));
}

export async function cancelOrderAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    if (!(await canManageOrders(v))) throw new InputError("権限がありません");
    const order = await fx().purchaseOrders.get(id);
    if (!order || order.status !== "ordered") throw new InputError("取り消せる発注がありません");
    await fx().purchaseOrders.update(id, { status: "cancelled" });
  }, "発注を取り消しました");
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

