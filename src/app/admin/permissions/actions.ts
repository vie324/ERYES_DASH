"use server";

// 人ごとの権限の付け外し（依頼11・13・15・18・21・22・23）。代表だけの権限は代表本人しか変えられない（permissions.ts の canGrant）。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { attempt, resultUrl, str, InputError } from "@/lib/action-utils";
import { permissionDef, setPermission, type PermissionKey } from "@/lib/permissions";

const BACK = "/admin/permissions";

export async function setPermissionAction(fd: FormData) {
  const session = await requireAdmin();
  const r = await attempt(async () => {
    const db = getDataStore();
    const key = str(fd, "key", 40) as PermissionKey;
    const def = permissionDef(key);
    if (!def) throw new InputError("権限が見つかりません");
    const [actor, target] = await Promise.all([db.getStaff(session.staffId), db.getStaff(str(fd, "staffId", 64))]);
    if (!actor || !target) throw new InputError("スタッフを選んでください");
    const granted = str(fd, "granted", 5) === "1";
    const ok = await setPermission({ actor, target, key, granted });
    if (!ok) throw new InputError(def.ownerOnly ? "この権限は代表本人だけが、代表にだけ付け外しできます" : "この権限は管理者だけが付け外しできます");
    return `${target.name}さんの「${def.label}」を${granted ? "付けました" : "外しました"}`;
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}
