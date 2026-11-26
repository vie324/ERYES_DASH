"use server";

// 依頼22：自分のInstagramのつながり（やめる・見本で試す）。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { isDemoMode } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { attempt, resultUrl, InputError } from "@/lib/action-utils";
import { connectDemoAccount, isInstagramConfigured } from "@/lib/instagram";

export async function disconnectInstagramAction() {
  const v = await requireViewer();
  const r = await attempt(async () => {
    const acc = await fx().instagramAccounts.find({ staffId: v.staffId });
    if (!acc) throw new InputError("つないでいません");
    // これまでの数字は残す（つなぎ直すと続きから集まる）。トークンは消す
    await fx().instagramAccounts.update(acc.id, { status: "disconnected", tokenEnc: "", lastError: "" });
    return "つなぐのをやめました（これまでの数字は残っています）";
  });
  revalidatePath("/staff/instagram");
  redirect(resultUrl("/staff/instagram", r));
}

/** デモ（Instagramの連携が未設定のとき）だけ：見本の数字でつないでみる */
export async function connectDemoInstagramAction() {
  const v = await requireViewer();
  const r = await attempt(async () => {
    if (isInstagramConfigured() || !isDemoMode()) throw new InputError("見本の数字で試せるのは、デモのときだけです");
    await connectDemoAccount(v.staffId, `${v.me?.name.replace(/\s/g, "") ?? "staff"}_eni`);
    return "見本の数字でつなぎました（デモ）";
  });
  revalidatePath("/staff/instagram");
  redirect(resultUrl("/staff/instagram", r));
}
