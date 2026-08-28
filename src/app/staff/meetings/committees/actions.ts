"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { toCommitteeKey } from "@/lib/eni/committees";

const BACK = "/staff/meetings/committees";

/** 会議体の編集は管理者のみ（幹部でも変更はできない＝運用の型を守る） */
async function requireAdminSession() {
  const session = await requireSession();
  if (session.role !== "admin") redirect(`${BACK}?error=forbidden`);
  return session;
}

/** 数値・配列フィールドの読み取り（改行区切りを配列にする） */
function lines(formData: FormData, name: string): string[] {
  return String(formData.get(name) ?? "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** 会議体の追加・更新 */
export async function saveCommitteeAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const db = getDataStore();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${BACK}?error=input`);

  const existing = await db.listCommittees();
  const rawKey = String(formData.get("committee_key") ?? "").trim();
  const committeeKey =
    rawKey || toCommitteeKey(name, existing.map((c) => c.committeeKey));

  const durationMin = Math.min(600, Math.max(15, Math.round(Number(formData.get("duration_min")) || 60)));
  const sortOrder = Math.max(0, Math.round(Number(formData.get("sort_order")) || 0));
  const current = existing.find((c) => c.committeeKey === committeeKey);

  await db.upsertCommittee({
    committeeKey,
    name,
    purpose: String(formData.get("purpose") ?? "").trim().slice(0, 500),
    cadence: String(formData.get("cadence") ?? "").trim().slice(0, 60),
    durationMin,
    participantsHint: String(formData.get("participants_hint") ?? "").trim().slice(0, 200),
    // 参加チーム（組織図のキー）は既存の値を引き継ぐ。参加者は下の個別指定で管理する
    orgTeams: current?.orgTeams ?? [],
    memberStaffIds: [...new Set(formData.getAll("members").map(String).filter(Boolean))],
    agenda: String(formData.get("agenda") ?? "").trim().slice(0, 2000),
    prechecks: lines(formData, "prechecks"),
    sortOrder: sortOrder || (current?.sortOrder ?? (existing.length + 1) * 10),
    isActive: formData.get("is_active") !== null ? formData.get("is_active") === "on" : true,
  });

  revalidatePath(BACK);
  revalidatePath("/staff/meetings");
  redirect(`${BACK}?saved=1`);
}

/** 会議体の削除（過去のミーティングの記録は残る） */
export async function deleteCommitteeAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const key = String(formData.get("committee_key") ?? "");
  if (formData.get("confirm") !== "on") redirect(`${BACK}?error=confirm`);
  if (key) await getDataStore().deleteCommittee(key);
  revalidatePath(BACK);
  redirect(`${BACK}?saved=deleted`);
}
