"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

const CARD_COLORS = ["gold", "rose", "sky", "mint"];

/** サンクスカードを送る */
export async function createThanksAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const toStaffId = String(formData.get("to") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  const colorRaw = String(formData.get("card_color") ?? "gold");
  const cardColor = CARD_COLORS.includes(colorRaw) ? colorRaw : "gold";

  const db = getDataStore();
  const to = toStaffId ? await db.getStaff(toStaffId) : null;
  if (!to || !body || to.id === session.staffId) {
    redirect("/staff/thanks?error=input");
  }

  await db.createThanksPost({
    fromStaffId: session.staffId,
    toStaffId,
    body,
    cardColor,
  });
  revalidatePath("/staff/thanks");
  redirect("/staff/thanks?saved=1");
}

/** いいねの付け外し */
export async function toggleThanksLikeAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = String(formData.get("post_id") ?? "");
  if (postId) await getDataStore().toggleThanksLike(postId, session.staffId);
  revalidatePath("/staff/thanks");
  redirect("/staff/thanks");
}

/** コメントを送る */
export async function createThanksCommentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 300);
  if (!postId || !body) redirect("/staff/thanks?error=input");

  await getDataStore().createThanksComment({
    postId,
    staffId: session.staffId,
    body,
  });
  revalidatePath("/staff/thanks");
  redirect("/staff/thanks");
}
