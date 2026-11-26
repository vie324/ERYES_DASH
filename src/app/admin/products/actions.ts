"use server";

// 依頼15：発注先・商品の一覧（管理者だけ）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { InputError, attempt, bool, int, resultUrl, str } from "@/lib/action-utils";
import { getProductSettings, PRODUCT_SETTINGS_KEY } from "@/lib/orders";
import { writeJsonSetting } from "@/lib/feature-settings";

export async function saveSupplierAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const name = str(fd, "name", 60);
    const orderUrl = str(fd, "order_url", 500);
    if (!name) throw new InputError("発注先の名前を入れてください");
    if (orderUrl && !/^https?:\/\/\S+$/.test(orderUrl)) throw new InputError("発注ページのURLは https:// から入れてください");
    const row = {
      name,
      orderUrl,
      contact: str(fd, "contact", 200),
      method: str(fd, "method", 100),
      deadlineNote: str(fd, "deadline_note", 100),
      leadDays: Math.max(0, int(fd, "lead_days", 3)),
      note: str(fd, "note", 500),
      isActive: !bool(fd, "inactive"),
      sortOrder: int(fd, "sort", 10),
      updatedAt: new Date(),
    };
    if (id) await fx().suppliers.update(id, row);
    else await fx().suppliers.insert(row);
  });
  revalidatePath("/staff/orders/place");
  redirect(resultUrl("/admin/suppliers", r));
}

export async function saveProductAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const name = str(fd, "name", 100);
    if (!name) throw new InputError("商品名を入れてください");
    const settings = await getProductSettings(getDataStore());
    const category = str(fd, "category", 30);
    if (!settings.categories.some((c) => c.key === category)) throw new InputError("種類を選んでください");
    const supplierId = str(fd, "supplier", 80) || null;
    if (supplierId && !(await fx().suppliers.get(supplierId))) throw new InputError("発注先を選び直してください");
    const row = {
      name,
      category,
      brand: str(fd, "brand", 60),
      supplierId,
      unit: str(fd, "unit", 10) || "個",
      retailPrice: Math.max(0, int(fd, "retail_price", 0)),
      staffPrice: Math.max(0, int(fd, "staff_price", 0)),
      costPrice: Math.max(0, int(fd, "cost_price", 0)),
      barcode: str(fd, "barcode", 40).replace(/\s/g, ""),
      reorderPoint: Math.max(0, int(fd, "reorder_point", 0)),
      reorderQty: Math.max(0, int(fd, "reorder_qty", 0)),
      isActive: !bool(fd, "inactive"),
      sortOrder: int(fd, "sort", 10),
      note: str(fd, "note", 300),
      updatedAt: new Date(),
    };
    if (id) await fx().products.update(id, row);
    else await fx().products.insert(row);
  });
  revalidatePath("/staff/orders/place");
  redirect(resultUrl(`/admin/products${id ? `#p-${id}` : ""}`, r));
}

export async function saveProductSettingsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const r = await attempt(async () => {
    const lines = str(fd, "categories", 2000).split("\n").map((l) => l.trim()).filter(Boolean);
    const categories = lines.map((l, i) => {
      const [key, ...label] = l.split(/[:：]/);
      return label.length ? { key: key.trim().slice(0, 30), label: label.join("：").trim().slice(0, 40) } : { key: `c${i}`, label: key.trim().slice(0, 40) };
    });
    if (categories.length === 0) throw new InputError("種類を1つ以上入れてください");
    await writeJsonSetting(getDataStore(), PRODUCT_SETTINGS_KEY, { categories, payrollDeduction: bool(fd, "payroll_deduction") });
  });
  redirect(resultUrl("/admin/products", r));
}
