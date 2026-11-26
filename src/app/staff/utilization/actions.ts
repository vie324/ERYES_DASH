"use server";

// 依頼17：イーリスの施術時間の入力（本人）と、データが無い日・おかしな日の手直し（幹部・管理者）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { InputError, attempt, int, isDate, resultUrl, str } from "@/lib/action-utils";
import { computeUtilizationForDate, rateOf } from "@/lib/utilization";
import { todayJst } from "@/lib/date";

export async function saveServedMinutesAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    if (!isDate(date) || date > todayJst()) throw new InputError("今日までの日付を選んでください");
    const served = Math.round(Number(str(fd, "hours", 5)) * 60) || int(fd, "minutes", 0);
    if (served <= 0 || served > 24 * 60) throw new InputError("施術時間を入れてください");
    const f = fx();
    const existing = await f.utilizationInputs.find({ staffId: v.staffId, date });
    const row = { servedMinutes: served, breakMinutes: Math.max(0, int(fd, "break", 0)), note: str(fd, "note", 200), updatedAt: new Date() };
    if (existing) await f.utilizationInputs.update(existing.id, row);
    else await f.utilizationInputs.insert({ staffId: v.staffId, date, createdBy: v.staffId, ...row });
    if (date < todayJst()) await computeUtilizationForDate(getDataStore(), date);
    return "施術時間を保存しました";
  });
  revalidatePath("/staff/utilization");
  redirect(resultUrl(`/staff/utilization?month=${date.slice(0, 7)}`, r));
}

/** 手直し：入客（施術）時間と、回せる時間（分母）を手で入れる。定期実行で上書きされない */
export async function fixUtilizationAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const staffId = str(fd, "staff", 80);
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    const db = getDataStore();
    const member = await db.getStaff(staffId);
    if (!member || !(v.isExec || v.isStoreManager) || !canSeeMember(v, member)) throw new InputError("直せるのは、その人の店舗の幹部と管理者です");
    if (!isDate(date)) throw new InputError("日付が正しくありません");
    const served = int(fd, "served", 0);
    const capacity = int(fd, "capacity", 0);
    if (capacity <= 0) throw new InputError("回せる時間（分）を入れてください");
    const f = fx();
    const existing = await f.utilizationDaily.find({ staffId, date });
    const row = {
      servedMinutes: served,
      capacityMinutes: capacity,
      rate: rateOf(served, capacity),
      source: "manual" as const,
      status: "manual" as const,
      note: str(fd, "note", 200) || "手で直した",
      updatedBy: v.staffId,
      computedAt: new Date(),
    };
    if (existing) await f.utilizationDaily.update(existing.id, row);
    else await f.utilizationDaily.insert({ staffId, date, storeId: member.storeId, brand: "eni", ...row });
    return "直しました（定期実行で上書きされません）";
  });
  revalidatePath("/staff/utilization");
  redirect(resultUrl(`/staff/utilization?view=team&month=${date.slice(0, 7)}`, r));
}
