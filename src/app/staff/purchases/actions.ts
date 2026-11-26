"use server";

// 依頼15：ウィッグ・社販の購入記録。本人は自分の分を記録できる。幹部・管理者はほかの人の分も記録できる。
// 社販価格は商品の一覧から自動で入る（商品にないものの手入力は幹部・管理者だけ）。社販は在庫からも減らす（依頼18）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { InputError, attempt, int, isDate, resultUrl, str } from "@/lib/action-utils";
import { recordMovement } from "@/lib/inventory";
import { todayJst } from "@/lib/date";

export async function recordPurchaseAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    const db = getDataStore();
    const staffId = str(fd, "staff", 80) || v.staffId;
    const staff = await db.getStaff(staffId);
    if (!staff || !staff.isActive) throw new InputError("買った人を選んでください");
    if (staffId !== v.staffId && !(v.isExec && canSeeMember(v, staff)) && !v.isAdmin) throw new InputError("ほかの人の分は、幹部・管理者が記録します");
    const date = str(fd, "date", 10) || todayJst();
    if (!isDate(date) || date > todayJst()) throw new InputError("今日までの日付を選んでください");
    const quantity = int(fd, "quantity", 1);
    if (quantity <= 0 || quantity > 999) throw new InputError("数を入れてください");
    const product = str(fd, "product", 80) ? await fx().products.get(str(fd, "product", 80)) : null;
    let itemName = product?.name ?? str(fd, "item_name", 100);
    let unitPrice = product ? product.staffPrice : int(fd, "unit_price", 0);
    if (!product) {
      if (!v.isExec && !v.isAdmin) throw new InputError("商品を選んでください（一覧にない物は幹部・管理者が記録します）");
      if (!itemName) throw new InputError("品名を入れてください");
    }
    itemName = itemName.slice(0, 100);
    unitPrice = Math.max(0, unitPrice);
    const category = str(fd, "category", 20) === "wig" || product?.category === "wig" ? "wig" : "staff_sale";
    const row = await fx().staffPurchases.insert({
      staffId,
      storeId: staff.storeId,
      productId: product?.id ?? null,
      itemName,
      category,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
      purchasedOn: date,
      recordedBy: v.staffId,
      note: str(fd, "note", 200),
    });
    if (product) {
      await recordMovement({ storeId: staff.storeId, productId: product.id, kind: "staff_sale", quantity, occurredOn: date, refType: "staff_purchase", refId: row.id, createdBy: v.staffId });
    }
    return `${itemName} × ${quantity}（${(unitPrice * quantity).toLocaleString()}円）を記録しました`;
  });
  revalidatePath("/staff/purchases");
  redirect(resultUrl("/staff/purchases", r));
}

export async function deletePurchaseAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const row = await fx().staffPurchases.get(id);
    if (!row) throw new InputError("記録が見つかりません");
    if (!v.isAdmin && row.recordedBy !== v.staffId) throw new InputError("記録した人か管理者だけが消せます");
    await fx().staffPurchases.remove(id);
    await fx().inventoryMovements.removeWhere({ refType: "staff_purchase", refId: id });
  }, "消しました");
  revalidatePath("/staff/purchases");
  redirect(resultUrl("/staff/purchases", r));
}
