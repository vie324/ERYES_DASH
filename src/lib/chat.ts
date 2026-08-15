// 社内チャットの共通ロジック。
// ルーム一覧の「相手の名前・最後のメッセージ・未読数」の計算を
// チャット一覧とホームのバッジで共通化する。

import type { ChatMember, ChatMessage, ChatRoom, DataStore, Staff } from "@/lib/data/types";

export interface ChatRoomOverview {
  room: ChatRoom;
  /** 表示名（グループ＝グループ名／DM＝相手の名前） */
  displayName: string;
  /** 自分以外のメンバー */
  others: Staff[];
  memberCount: number;
  lastMessage: ChatMessage | null;
  unread: number;
}

export interface ChatOverview {
  rooms: ChatRoomOverview[];
  totalUnread: number;
}

/** リアクションに使える絵文字（LINEのスタンプ代わりの固定セット） */
export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "😢", "🎉"] as const;

export async function getChatOverview(
  db: DataStore,
  staffId: string,
  staffList?: Staff[]
): Promise<ChatOverview> {
  const [rooms, allStaff] = await Promise.all([
    db.listChatRooms(staffId),
    staffList ? Promise.resolve(staffList) : db.listStaff(),
  ]);
  if (rooms.length === 0) return { rooms: [], totalUnread: 0 };

  const roomIds = rooms.map((r) => r.id);
  const [members, recentMessages] = await Promise.all([
    db.listChatMembers(roomIds),
    db.listChatMessagesForRooms(roomIds, 300), // 新しい順
  ]);
  const staffMap = new Map(allStaff.map((s) => [s.id, s]));
  const membersByRoom = new Map<string, ChatMember[]>();
  for (const m of members) {
    const list = membersByRoom.get(m.roomId) ?? [];
    list.push(m);
    membersByRoom.set(m.roomId, list);
  }

  const overviews: ChatRoomOverview[] = rooms.map((room) => {
    const roomMembers = membersByRoom.get(room.id) ?? [];
    const me = roomMembers.find((m) => m.staffId === staffId);
    const others = roomMembers
      .filter((m) => m.staffId !== staffId)
      .map((m) => staffMap.get(m.staffId))
      .filter((s): s is Staff => Boolean(s));
    const messages = recentMessages.filter((m) => m.roomId === room.id);
    const lastMessage = messages[0] ?? null;
    const unread = me
      ? messages.filter((m) => m.senderId !== staffId && !m.deleted && m.createdAt > me.lastReadAt).length
      : 0;
    return {
      room,
      displayName: room.isGroup
        ? room.name || "グループ"
        : others.map((s) => s.name).join("、") || "（相手なし）",
      others,
      memberCount: roomMembers.length,
      lastMessage,
      unread,
    };
  });

  // 最後のメッセージが新しい順（メッセージのないルームは作成順で後ろ）
  overviews.sort(
    (a, b) =>
      (b.lastMessage?.createdAt.getTime() ?? b.room.createdAt.getTime()) -
      (a.lastMessage?.createdAt.getTime() ?? a.room.createdAt.getTime())
  );

  return {
    rooms: overviews,
    totalUnread: overviews.reduce((sum, r) => sum + r.unread, 0),
  };
}

/** メッセージ本文のプレビュー（一覧用） */
export function messagePreview(message: ChatMessage | null): string {
  if (!message) return "メッセージはまだありません";
  if (message.deleted) return "メッセージの送信を取り消しました";
  if (message.image) return "📷 画像";
  return message.body;
}
