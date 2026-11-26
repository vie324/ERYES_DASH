"use server";

// 依頼13：レジ締めの設定（摘要の種類・項目名・釣り銭準備金の初期値・全員が入力できる店舗・出納帳の始まり）。管理者だけ。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { InputError, attempt, int, resultUrl, str } from "@/lib/action-utils";
import { writeJsonSetting } from "@/lib/feature-settings";
import { CASH_SETTINGS_KEY, DEFAULT_CASH_SETTINGS, getCashSettings, type CashKind } from "@/lib/cash";

export async function saveCashSettingsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const r = await attempt(async () => {
    const db = getDataStore();
    const current = await getCashSettings(db);
    // 摘要の種類：「名前,+ / - / 0」を1行ずつ（＋＝入金・−＝出金・0＝出し入れなし（両替など））
    const kinds: CashKind[] = [];
    const lines = str(fd, "kinds", 3000).split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const [label, dir] = line.split(/[,，]/).map((x) => x.trim());
      if (!label) return;
      const direction = dir === "+" || dir === "＋" ? "in" : dir === "0" || dir === "±" ? "none" : "out";
      const prev = current.kinds.find((k) => k.label === label);
      kinds.push({ key: prev?.key ?? `k${Date.now().toString(36)}${i}`, label: label.slice(0, 30), direction });
    });
    if (kinds.length === 0) throw new InputError("摘要の種類を1つ以上入れてください");
    const stores = await db.listStores();
    const openStoreIds = fd.getAll("open_store").map(String).filter((id) => stores.some((s) => s.id === id));
    const openings: Record<string, { month: string; balance: number }> = { ...current.openings };
    for (const s of stores) {
      const month = str(fd, `opening_month_${s.id}`, 7);
      if (/^\d{4}-\d{2}$/.test(month)) openings[s.id] = { month, balance: int(fd, `opening_balance_${s.id}`, 0) };
    }
    await writeJsonSetting(db, CASH_SETTINGS_KEY, {
      kinds,
      labels: {
        changeFund: str(fd, "label_change_fund", 30) || DEFAULT_CASH_SETTINGS.labels.changeFund,
        cashSales: str(fd, "label_cash_sales", 30) || DEFAULT_CASH_SETTINGS.labels.cashSales,
        counted: str(fd, "label_counted", 40) || DEFAULT_CASH_SETTINGS.labels.counted,
        diffReason: str(fd, "label_diff_reason", 30) || DEFAULT_CASH_SETTINGS.labels.diffReason,
      },
      defaultChangeFund: Math.max(0, int(fd, "default_change_fund", DEFAULT_CASH_SETTINGS.defaultChangeFund)),
      openStoreIds,
      openings,
      openStoresAuto: false,
    });
  });
  revalidatePath("/staff/cash");
  redirect(resultUrl("/admin/cash", r));
}
