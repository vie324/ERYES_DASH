"use server";

// 依頼20：カリキュラムの合格の判定とコメント（幹部・店舗の管理者・管理者が、担当メンバーに入れる）。
// 画面で隠すだけでなく、ここでも「担当メンバーか」を確かめる。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { attempt, resultUrl, str, InputError } from "@/lib/action-utils";
import { notifyStaff } from "@/lib/notify";

function safeBack(raw: string, fallback: string): string {
  return raw.startsWith("/staff/growth") ? raw : fallback;
}

export async function judgeItemAction(fd: FormData) {
  const v = await requireViewer();
  const staffId = str(fd, "staff", 64);
  const itemId = str(fd, "item", 64);
  const status = str(fd, "status", 16);
  const comment = str(fd, "comment", 500);
  const back = safeBack(str(fd, "back", 300), `/staff/growth?staff=${encodeURIComponent(staffId)}`);
  const r = await attempt(async () => {
    if (!v.isExec && !v.isStoreManager) throw new InputError("合格の判定は幹部・店舗の管理者だけができます");
    if (status !== "passed" && status !== "retry" && status !== "clear") throw new InputError("判定を選んでください");
    const db = getDataStore();
    const member = await db.getStaff(staffId);
    if (!member || member.id === v.staffId || !canSeeMember(v, member)) throw new InputError("このメンバーは判定できません");
    const f = fx();
    const item = await f.curriculumItems.get(itemId);
    if (!item) throw new InputError("項目が見つかりません");
    const existing = await f.curriculumResults.find({ staffId, itemId });
    if (status === "clear") {
      if (existing) await f.curriculumResults.remove(existing.id);
      return "判定を取り消しました";
    }
    const row = { status: status as "passed" | "retry", comment, judgedBy: v.staffId, judgedAt: new Date() };
    if (existing) await f.curriculumResults.update(existing.id, row);
    else await f.curriculumResults.insert({ staffId, itemId, ...row });
    await notifyStaff(db, [staffId], {
      kind: "goal",
      title: status === "passed" ? `「${item.title}」合格です` : `「${item.title}」もう一度`,
      body: comment || (status === "passed" ? "おめでとうございます！" : "次の練習で、もう一度見てもらいましょう"),
      href: "/staff/growth",
      refId: item.id,
    });
    return status === "passed" ? "合格にしました（本人に通知しました）" : "もう一度にしました（本人に通知しました）";
  });
  revalidatePath("/staff/growth");
  redirect(resultUrl(back, r));
}
