"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { DASHBOARD_THEMES } from "@/lib/theme";

/** ダッシュボードの配色を選ぶ（自分のぶんだけ。誰の画面にも影響しない） */
export async function setDashboardThemeAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const key = String(formData.get("theme") ?? "");
  const back = String(formData.get("back") ?? "/staff");
  if (!DASHBOARD_THEMES.some((t) => t.key === key)) redirect(back);

  await getDataStore().updateStaff(session.staffId, { themeColor: key });
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(back);
}
