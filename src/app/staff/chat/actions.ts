"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ALL_ROOM_KEY, extractMentions } from "@/lib/chat";

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

/**
 * グループを作成。
 * 「自分は入らないグループ」も作れる（例：幹部が現場メンバーだけのルームを用意する）。
 * 自分が入らない場合はそのルームを開けないので、一覧に戻って知らせる。
 */
export async function createGroupAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim().slice(0, 50);
  const memberIds = [...new Set(formData.getAll("members").map(String).filter(Boolean))];
  const joinSelf = formData.get("join_self") === "on";
  const ids = joinSelf ? [...new Set([session.staffId, ...memberIds])] : memberIds;
  if (!name || ids.length === 0) redirect("/staff/chat?error=input");

  const room = await getDataStore().createGroupRoom(name, session.staffId, ids);
  revalidatePath("/staff/chat");
  // 自分が入っていないルームは開けないので、一覧に戻る
  if (!ids.includes(session.staffId)) redirect("/staff/chat?created=other");
  redirect(`/staff/chat/${room.id}`);
}

/** グループ名・メンバーの変更（全体共有は変更できない） */
export async function updateGroupAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const roomId = String(formData.get("room_id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 50);
  const memberIds = [...new Set(formData.getAll("members").map(String).filter(Boolean))];
  if (!roomId || !name || memberIds.length === 0) redirect(`/staff/chat/${roomId}?error=input`);

  const db = getDataStore();
  const room = await db.getChatRoom(roomId);
  if (!room || !room.isGroup || room.roomKey === ALL_ROOM_KEY) {
    redirect(`/staff/chat/${roomId}?error=forbidden`);
  }
  await requireMembership(roomId, session.staffId);
  await db.updateGroupRoom(roomId, { name, memberIds });
  revalidatePath(`/staff/chat/${roomId}`);
  revalidatePath("/staff/chat");
  // 自分を外した場合は一覧へ
  if (!memberIds.includes(session.staffId)) redirect("/staff/chat?left=1");
  redirect(`/staff/chat/${roomId}?saved=members`);
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
  const file = String(formData.get("file") ?? "");
  const fileName = String(formData.get("file_name") ?? "").trim().slice(0, 120);
  const replyToId = String(formData.get("reply_to") ?? "");
  if (!roomId || (!body && !image && !file)) return;
  // 画像はデータURL（JPEG/PNG/WebP）、ファイルはPDFのみ受け付ける
  if (image && !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return;
  if (file && !/^data:application\/pdf;base64,/.test(file)) return;

  await requireMembership(roomId, session.staffId);
  const db = getDataStore();
  // @名前 を拾って、そのルームのメンバーだけをメンション先にする
  const [members, staffList] = await Promise.all([db.listChatMembers([roomId]), db.listStaff()]);
  const memberIds = new Set(members.map((m) => m.staffId));
  const roomStaff = staffList.filter((s) => memberIds.has(s.id));

  await db.createChatMessage({
    roomId,
    senderId: session.staffId,
    body,
    image,
    file,
    fileName: file ? fileName || "資料.pdf" : "",
    replyToId,
    mentions: body ? extractMentions(body, roomStaff) : [],
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

/** ノートへの固定・解除（あとから読み返したい連絡をルームの上部にためる） */
export async function togglePinAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const messageId = String(formData.get("message_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "");
  const pinned = formData.get("pinned") === "1";
  if (!messageId) redirect(`/staff/chat/${roomId}`);

  await requireMembership(roomId, session.staffId);
  await getDataStore().setChatMessagePinned(messageId, pinned);
  revalidatePath(`/staff/chat/${roomId}`);
  redirect(`/staff/chat/${roomId}?tab=notes`);
}

/**
 * アナウンス（ダッシュボード最上部に大きく出す）。
 * 全体共有ルームの投稿だけが対象で、操作できるのは幹部・管理者。
 */
export async function toggleAnnounceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const messageId = String(formData.get("message_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "");
  const announced = formData.get("announced") === "1";
  if (!messageId) redirect(`/staff/chat/${roomId}`);

  const db = getDataStore();
  const room = await db.getChatRoom(roomId);
  if (!room || room.roomKey !== ALL_ROOM_KEY || !(await isExecutive(session))) {
    redirect(`/staff/chat/${roomId}?error=forbidden`);
  }
  await requireMembership(roomId, session.staffId);
  await db.setChatMessageAnnounced(messageId, session.staffId, announced);
  revalidatePath(`/staff/chat/${roomId}`);
  revalidatePath("/staff");
  redirect(`/staff/chat/${roomId}?saved=${announced ? "announced" : "unannounced"}`);
}

/** 議事録をトークルームへ転送する（ミーティング画面から呼ぶ） */
export async function forwardMinutesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const roomId = String(formData.get("room_id") ?? "");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const back = String(formData.get("back") ?? "/staff/meetings");
  if (!roomId || !meetingId) redirect(`${back}?error=input`);

  const db = getDataStore();
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) redirect(`${back}?error=input`);
  await requireMembership(roomId, session.staffId);

  const title = meeting.title || meeting.committee || "ミーティング";
  const body = [
    `【議事録】${title}（${meeting.meetingDate}）`,
    meeting.minutesText.trim() || "（本文なし）",
  ]
    .join("\n\n")
    .slice(0, 2000);

  await db.createChatMessage({
    roomId,
    senderId: session.staffId,
    body,
    image: "",
    // 転送した議事録は、あとから探せるようノートにも残す
  });
  const sent = await db.listChatMessages(roomId, 1);
  if (sent[0]) await db.setChatMessagePinned(sent[0].id, true);

  revalidatePath(`/staff/chat/${roomId}`);
  revalidatePath("/staff/chat");
  redirect(`/staff/chat/${roomId}?saved=forwarded`);
}
