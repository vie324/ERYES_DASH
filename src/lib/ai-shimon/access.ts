// AIしもんの相談の記録を読める人（代表）の判定。
// 代表は staff.is_owner で決まり、アプリの画面からは変えられない
// （管理者が自分に付けて、スタッフの相談を読めてしまわないように。設定は supabase/schema.sql の末尾）。

import { getDataStore } from "@/lib/data";
import type { Session } from "@/lib/auth/session";
import type { Staff } from "@/lib/data/types";

/** ログイン中の人が代表か（在籍中のアカウントに限る） */
export async function isAiShimonOwner(session: Session): Promise<boolean> {
  const me = await getDataStore().getStaff(session.staffId);
  return Boolean(me?.isActive && me.isOwner);
}

/** 代表のアカウント（相談画面の「誰が読めるか」の表示に使う。未設定なら null） */
export function findOwner(staffList: Staff[]): Staff | null {
  return staffList.find((s) => s.isActive && s.isOwner) ?? null;
}
