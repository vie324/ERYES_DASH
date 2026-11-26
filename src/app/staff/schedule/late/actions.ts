"use server";

// 依頼12：締切後の希望休の申請（本人）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { InputError, attempt, bool, isDate, resultUrl, str } from "@/lib/action-utils";
import { isPastDeadline, requestLateDayoff } from "@/lib/shift/extras";
import { todayJst } from "@/lib/date";

export async function requestLateDayoffAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    if (!v.me) throw new InputError("スタッフが見つかりません");
    const today = todayJst();
    if (!isDate(date) || date < today) throw new InputError("今日以降の日付を選んでください");
    const db = getDataStore();
    if (!(await isPastDeadline(db, date, today))) {
      throw new InputError("この月はまだ締切前です。「希望休を出す」から出してください（承認は要りません）");
    }
    const dup = await fx().dayoffLateRequests.find({ staffId: v.staffId, date, status: "pending" });
    if (dup) throw new InputError("その日はもう申請しています（承認待ち）");
    await requestLateDayoff(db, v.me, { date, reason: str(fd, "reason", 100), paidLeave: bool(fd, "paid_leave") });
    return "申請しました。店長の承認を待っています";
  });
  revalidatePath("/staff/schedule/late");
  redirect(resultUrl("/staff/schedule/late", r));
}

export async function cancelLateDayoffAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const row = await fx().dayoffLateRequests.get(id);
    if (!row || row.staffId !== v.staffId || row.status !== "pending") throw new InputError("取り下げられる申請がありません");
    await fx().dayoffLateRequests.remove(id);
  }, "申請を取り下げました");
  redirect(resultUrl("/staff/schedule/late", r));
}
