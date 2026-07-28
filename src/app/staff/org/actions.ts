"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { findTeam } from "@/lib/eni/org";

/** チームの所属メンバーとリーダーを保存（幹部・管理者のみ） */
export async function saveOrgTeamAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff/org?error=forbidden");

  const teamKey = String(formData.get("team_key") ?? "");
  if (!findTeam(teamKey)) redirect("/staff/org?error=input");

  const leaderId = String(formData.get("leader_staff_id") ?? "");
  const memberIds = formData.getAll("members").map(String).filter(Boolean).slice(0, 50);
  // リーダーは必ずメンバーに含める（選び忘れで外れないように）
  const ids = [...new Set(leaderId ? [leaderId, ...memberIds] : memberIds)];

  await getDataStore().setOrgTeamMembers(
    teamKey,
    ids.map((staffId) => ({ staffId, roleLabel: staffId === leaderId ? "リーダー" : "" }))
  );
  revalidatePath("/staff/org");
  revalidatePath("/staff/meetings/committees");
  redirect(`/staff/org?saved=${teamKey}`);
}
