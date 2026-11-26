"use server";

// 依頼12：打刻の修正の申請（本人）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { InputError, attempt, isDate, isTime, resultUrl, str } from "@/lib/action-utils";
import { requestCorrection } from "@/lib/attendance-corrections";
import { todayJst } from "@/lib/date";

export async function requestCorrectionAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const r = await attempt(async () => {
    if (!v.me) throw new InputError("スタッフが見つかりません");
    const date = str(fd, "date", 10);
    const time = str(fd, "time", 5);
    const punchType = str(fd, "type", 3) === "out" ? "out" : "in";
    const reason = str(fd, "reason", 200);
    if (!isDate(date) || date > todayJst()) throw new InputError("今日までの日付を選んでください");
    if (!isTime(time)) throw new InputError("時刻を入れてください");
    if (!reason) throw new InputError("理由を入れてください（例：打刻を忘れた・電波が届かなかった）");
    const dup = await fx().attendanceCorrections.find({ staffId: v.staffId, date, punchType, status: "pending" });
    if (dup) throw new InputError("同じ日の同じ打刻の申請が、まだ承認待ちです");
    await requestCorrection(getDataStore(), v.me, { date, punchType, time, reason });
    return "申請しました。店長の承認を待っています";
  });
  revalidatePath("/staff/attendance");
  redirect(resultUrl("/staff/attendance#correction", r));
}
