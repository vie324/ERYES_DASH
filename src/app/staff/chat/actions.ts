"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";

/** そのルームのメンバーか（メンバー以外は読めない・送れない） */
async function requireMembership(roomId: string, staffId: string): Promise<void> {
  const members = await getDataStore().listChatMembers([roomId]);
  if (!members.some((m) => m.staffId === staffId)) redirect("/staff/chat?error=forbidden");
}

/** DMを開始（既にあればそのルームへ） */
export async function startDmAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const partnerId = String(formData.get("partner") ?? "");
  const db = getDataStore();
  const partner = partnerId ? await db.getStaff(partnerId) : null;
  if (!partner || partner.id === session.staffId) redirect("/staff/chat?error=input");

  const room = await db.getOrCreateDmRoom(session.staffId, partnerId);
  revalidatePath("/staff/chat");
  redirect(`/staff/chat/${room.id}`);
}

/** グループを作成 */
export async function createGroupAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim().slice(0, 50);
  const memberIds = formData.getAll("members").map(String).filter(Boolean);
  if (!name || memberIds.length === 0) redirect("/staff/chat?error=input");

  const room = await getDataStore().createGroupRoom(name, session.staffId, memberIds);
  revalidatePath("/staff/chat");
  redirect(`/staff/chat/${room.id}`);
}

/**
 * メッセージ送信。クライアントの送信フォームから直接呼ぶため、
 * リダイレクトせずに再検証だけ行う（画面はクライアント側で refresh する）。
 */
export async function sendMessageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const roomId = String(formData.get("room_id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const image = String(formData.get("image") ?? "");
  if (!roomId || (!body && !image)) return;
  // 画像はデータURL（JPEG/PNG）のみ受け付ける
  if (image && !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return;

  await requireMembership(roomId, session.staffId);
  await getDataStore().createChatMessage({
    roomId,
    senderId: session.staffId,
    body,
    image,
  });
  revalidatePath(`/staff/chat/${roomId}`);
  revalidatePath("/staff/chat");
}

/** メッセージの送信取消（自分のメッセージのみ） */
export async function deleteMessageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("message_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "");
  if (id) await getDataStore().deleteChatMessage(id, session.staffId);
  revalidatePath(`/staff/chat/${roomId}`);
  redirect(`/staff/chat/${roomId}`);
}

/** リアクションの付け外し */
export async function toggleReactionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const messageId = String(formData.get("message_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "");
  const emoji = String(formData.get("emoji") ?? "").slice(0, 8);
  if (!messageId || !emoji) redirect(`/staff/chat/${roomId}`);

  await requireMembership(roomId, session.staffId);
  await getDataStore().toggleChatReaction(messageId, session.staffId, emoji);
  revalidatePath(`/staff/chat/${roomId}`);
  redirect(`/staff/chat/${roomId}`);
}
