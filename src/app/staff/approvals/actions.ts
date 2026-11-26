"use server";

// 承認のお願い（締切後の希望休・打刻の修正・締め日後の入力の救済）をまとめて決める。
// 決められるのは、その人の店舗の店長（幹部）・担当店舗の店舗の管理者・管理者（lib/shift/extras.ts の canApproveFor）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { InputError, attempt, resultUrl, str } from "@/lib/action-utils";
import { decideLateDayoff } from "@/lib/shift/extras";
import { decideCorrection } from "@/lib/attendance-corrections";

export async function decideApprovalAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const kind = str(fd, "kind", 20);
  const id = str(fd, "id", 80);
  const decision = str(fd, "decision", 10) === "approved" ? "approved" : "rejected";
  const note = str(fd, "note", 200);
  const r = await attempt(async () => {
    if (!v.me) throw new InputError("スタッフが見つかりません");
    const db = getDataStore();
    const res =
      kind === "dayoff"
        ? await decideLateDayoff(db, v.me, id, decision, note)
        : kind === "correction"
          ? await decideCorrection(db, v.me, id, decision, note)
          : { ok: false, message: "種類が正しくありません" };
    if (!res.ok) throw new InputError(res.message);
    // 自分あての「承認のお願い」のお知らせは、決めたら既読にする
    await db.markAppNotificationsRead(v.staffId, id);
    return res.message;
  });
  revalidatePath("/staff/approvals");
  revalidatePath("/staff/schedule");
  revalidatePath("/admin/schedule");
  redirect(resultUrl("/staff/approvals", r));
}
