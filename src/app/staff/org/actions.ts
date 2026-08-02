"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ORG_CHARTS, makeUnitKey } from "@/lib/eni/org";

async function requireExec(): Promise<void> {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff/org?error=forbidden");
}

/** 部署・チームの追加（管理者・幹部のみ） */
export async function createOrgUnitAction(formData: FormData): Promise<void> {
  await requireExec();
  const chartKey = String(formData.get("chart_key") ?? "company");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const parentKey = String(formData.get("parent_key") ?? "");
  const mission = String(formData.get("mission") ?? "").trim().slice(0, 300);
  const color = String(formData.get("color") ?? "#94815a").slice(0, 20);
  if (!name || !ORG_CHARTS.some((c) => c.key === chartKey)) {
    redirect(`/staff/org?chart=${chartKey}&error=input`);
  }

  const db = getDataStore();
  const units = await db.listOrgUnits();
  const sameChart = units.filter((u) => u.chartKey === chartKey);
  await db.upsertOrgUnit({
    chartKey,
    unitKey: makeUnitKey(units.map((u) => u.unitKey)),
    parentKey,
    name,
    mission,
    meetingKey: "",
    color,
    sortOrder: (sameChart.at(-1)?.sortOrder ?? 0) + 10,
  });
  revalidatePath("/staff/org");
  redirect(`/staff/org?chart=${chartKey}&saved=created`);
}

/** 部署・チームの内容を更新（名前・役割・親・並び順） */
export async function updateOrgUnitAction(formData: FormData): Promise<void> {
  await requireExec();
  const unitKey = String(formData.get("unit_key") ?? "");
  const chartKey = String(formData.get("chart_key") ?? "company");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const parentKeyRaw = String(formData.get("parent_key") ?? "");
  const mission = String(formData.get("mission") ?? "").trim().slice(0, 300);
  const meetingKey = String(formData.get("meeting_key") ?? "").slice(0, 40);
  const color = String(formData.get("color") ?? "#94815a").slice(0, 20);
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  const db = getDataStore();
  const units = await db.listOrgUnits();
  const current = units.find((u) => u.unitKey === unitKey);
  if (!current || !name) redirect(`/staff/org?chart=${chartKey}&error=input`);

  // 自分自身や自分の子を親にすると循環するため、その場合は最上位に戻す
  const descendants = new Set<string>([unitKey]);
  let added = true;
  while (added) {
    added = false;
    for (const u of units) {
      if (u.parentKey && descendants.has(u.parentKey) && !descendants.has(u.unitKey)) {
        descendants.add(u.unitKey);
        added = true;
      }
    }
  }
  const parentKey = descendants.has(parentKeyRaw) ? "" : parentKeyRaw;

  await db.upsertOrgUnit({
    chartKey: current!.chartKey,
    unitKey,
    parentKey,
    name,
    mission,
    meetingKey,
    color,
    sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : current!.sortOrder,
  });
  revalidatePath("/staff/org");
  revalidatePath("/staff/meetings");
  redirect(`/staff/org?chart=${chartKey}&saved=updated`);
}

/** 部署・チームの削除（子は最上位へ繰り上げ） */
export async function deleteOrgUnitAction(formData: FormData): Promise<void> {
  await requireExec();
  const unitKey = String(formData.get("unit_key") ?? "");
  const chartKey = String(formData.get("chart_key") ?? "company");
  if (unitKey) await getDataStore().deleteOrgUnit(unitKey);
  revalidatePath("/staff/org");
  redirect(`/staff/org?chart=${chartKey}&saved=deleted`);
}

/** チームの所属メンバーとリーダーを保存 */
export async function saveOrgTeamAction(formData: FormData): Promise<void> {
  await requireExec();
  const teamKey = String(formData.get("team_key") ?? "");
  const chartKey = String(formData.get("chart_key") ?? "company");

  const db = getDataStore();
  const units = await db.listOrgUnits();
  if (!units.some((u) => u.unitKey === teamKey)) {
    redirect(`/staff/org?chart=${chartKey}&error=input`);
  }

  const leaderId = String(formData.get("leader_staff_id") ?? "");
  const memberIds = formData.getAll("members").map(String).filter(Boolean).slice(0, 50);
  // リーダーは必ずメンバーに含める（選び忘れで外れないように）
  const ids = [...new Set(leaderId ? [leaderId, ...memberIds] : memberIds)];

  await db.setOrgTeamMembers(
    teamKey,
    ids.map((staffId) => ({ staffId, roleLabel: staffId === leaderId ? "リーダー" : "" }))
  );
  revalidatePath("/staff/org");
  revalidatePath("/staff/meetings/committees");
  redirect(`/staff/org?chart=${chartKey}&saved=members`);
}

/** 一人ひとりの役割・ミッションを保存（組織図から編集） */
export async function saveStaffMissionAction(formData: FormData): Promise<void> {
  await requireExec();
  const staffId = String(formData.get("staff_id") ?? "");
  const chartKey = String(formData.get("chart_key") ?? "company");
  const mission = String(formData.get("mission") ?? "").trim().slice(0, 500);
  if (staffId) await getDataStore().updateStaff(staffId, { mission });
  revalidatePath("/staff/org");
  redirect(`/staff/org?chart=${chartKey}&saved=mission`);
}
