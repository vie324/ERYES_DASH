"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import type { OrderCategory, OrderStatus } from "@/lib/data/types";

/** 発注・購入申請の送信 */
export async function createOrderRequestAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const categoryRaw = String(formData.get("category") ?? "");
  const category: OrderCategory =
    categoryRaw === "wig" || categoryRaw === "store_sale" || categoryRaw === "material"
      ? categoryRaw
      : "material";
  const itemName = String(formData.get("item_name") ?? "").trim().slice(0, 100);
  const quantity = Number(formData.get("quantity") ?? 1);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  // 発注先URL（任意）。リンクとして安全な http(s) のみ受け付ける
  const supplierUrl = String(formData.get("supplier_url") ?? "").trim().slice(0, 500);

  if (!itemName || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    redirect("/staff/orders?error=input");
  }
  if (supplierUrl && !/^https?:\/\//.test(supplierUrl)) {
    redirect("/staff/orders?error=input");
  }

  await getDataStore().createOrderRequest({
    staffId: session.staffId,
    category,
    itemName,
    quantity: Math.round(quantity),
    note,
    supplierUrl,
  });
  revalidatePath("/staff/orders");
  redirect("/staff/orders?saved=1");
}

/** 発注状況の更新（幹部・管理者のみ）：申請中→発注済み→受取済み */
export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff/orders?error=forbidden");

  const id = String(formData.get("id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const status: OrderStatus =
    statusRaw === "ordered" || statusRaw === "received" ? statusRaw : "requested";
  const month = String(formData.get("month") ?? "");

  if (id) await getDataStore().updateOrderStatus(id, status);
  revalidatePath("/staff/orders");
  redirect(`/staff/orders?month=${month}&saved=status`);
}
