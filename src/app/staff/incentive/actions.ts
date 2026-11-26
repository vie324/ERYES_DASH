"use server";

// 依頼14：締め日後の入力の救済の申請（本人）。管理者が承認すると、インセンティブに入る。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { InputError, attempt, isDate, isMonth, resultUrl, str } from "@/lib/action-utils";
import { INPUT_DEFS, type InputKey } from "@/lib/required-inputs";
import { requestRescue } from "@/lib/required-inputs/incentive";

export async function requestRescueAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const month = str(fd, "month", 7);
  const r = await attempt(async () => {
    if (!v.me) throw new InputError("スタッフが見つかりません");
    const key = str(fd, "key", 30) as InputKey;
    const date = str(fd, "date", 10);
    const reason = str(fd, "reason", 300);
    if (!isMonth(month) || !isDate(date) || !(key in INPUT_DEFS)) throw new InputError("申請の内容が正しくありません");
    if (!reason) throw new InputError("理由を入れてください");
    const dup = await fx().incentiveRescues.find({ staffId: v.staffId, inputKey: key, date, status: "pending" });
    if (dup) throw new InputError("同じ日の申請が、まだ承認待ちです");
    await requestRescue(getDataStore(), v.me, { month, inputKey: key, date, reason });
    return "申請しました。管理者の承認を待っています";
  });
  revalidatePath("/staff/incentive");
  redirect(resultUrl(`/staff/incentive?month=${month}`, r));
}
