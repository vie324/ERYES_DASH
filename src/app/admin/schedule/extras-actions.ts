"use server";

// 依頼12：勤務パターン・1日ごとの必要人数（管理者だけ）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { InputError, attempt, bool, int, isDate, isTime, resultUrl, str } from "@/lib/action-utils";

export async function saveTemplateAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const name = str(fd, "name", 20);
    const startTime = str(fd, "start", 5);
    const endTime = str(fd, "end", 5);
    if (!name) throw new InputError("名前を入れてください");
    if (!isTime(startTime) || !isTime(endTime) || startTime >= endTime) throw new InputError("時間を正しく入れてください（終わりは始まりより後）");
    const row = {
      name,
      startTime,
      endTime,
      breakMinutes: Math.max(0, Math.min(240, int(fd, "break", 60))),
      sortOrder: int(fd, "sort", 10),
      isActive: !bool(fd, "inactive"),
    };
    if (id && !id.startsWith("default-")) await fx().shiftTemplates.update(id, row);
    else await fx().shiftTemplates.insert(row);
  });
  revalidatePath("/admin/schedule");
  redirect(resultUrl("/admin/schedule/templates", r));
}

export async function deleteTemplateAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    await fx().shiftTemplates.remove(id);
  }, "消しました");
  revalidatePath("/admin/schedule");
  redirect(resultUrl("/admin/schedule/templates", r));
}

/** 曜日ごとの必要人数（店舗ごと。空欄はルールの最低人数のまま） */
export async function saveWeekdayStaffingAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const storeId = str(fd, "store", 80);
  const month = str(fd, "month", 7);
  const r = await attempt(async () => {
    const stores = await getDataStore().listStores();
    if (!stores.some((s) => s.id === storeId)) throw new InputError("店舗を選んでください");
    const f = fx();
    for (let wd = 0; wd < 7; wd++) {
      const raw = str(fd, `wd_${wd}`, 3);
      await f.shiftStaffingRules.removeWhere({ storeId, weekday: wd, date: "" });
      if (raw !== "") await f.shiftStaffingRules.insert({ storeId, weekday: wd, date: "", required: Math.max(0, Math.min(50, Number(raw) || 0)) });
    }
  });
  revalidatePath("/admin/schedule");
  redirect(resultUrl(`/admin/schedule/staffing?month=${month}&store=${storeId}`, r));
}

/** 日付ごとの必要人数（イベントの日など。曜日の決まりより優先） */
export async function saveDateStaffingAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const storeId = str(fd, "store", 80);
  const date = str(fd, "date", 10);
  const month = str(fd, "month", 7);
  const r = await attempt(async () => {
    if (!isDate(date)) throw new InputError("日付を選んでください");
    const raw = str(fd, "required", 3);
    const f = fx();
    await f.shiftStaffingRules.removeWhere({ storeId, date });
    if (raw !== "") await f.shiftStaffingRules.insert({ storeId, weekday: -1, date, required: Math.max(0, Math.min(50, Number(raw) || 0)) });
    return raw === "" ? "その日の指定を外しました" : "保存しました";
  });
  revalidatePath("/admin/schedule");
  redirect(resultUrl(`/admin/schedule/staffing?month=${month || date.slice(0, 7)}&store=${storeId}`, r));
}
