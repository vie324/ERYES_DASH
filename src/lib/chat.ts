// 社内トークルームの共通ロジック。
// ルーム一覧の「相手の名前・最後のメッセージ・未読数」の計算を
// トーク一覧とホームのバッジで共通化する。

import type {
  ChatMember,
  ChatMessage,
  ChatRoom,
  DataStore,
  Staff,
} from "@/lib/data/types";

/** 全体共有ルームの識別キー（全員が強制参加。アナウンスの発信元） */
export const ALL_ROOM_KEY = "all";
export const ALL_ROOM_NAME = "全体共有";

export interface ChatRoomOverview {
  room: ChatRoom;
  /** 表示名（グループ＝グループ名／DM＝相手の名前） */
  displayName: string;
  /** 自分以外のメンバー */
  others: Staff[];
  memberCount: number;
  lastMessage: ChatMessage | null;
  unread: number;
  /** 自分あてのメンションが未読の中にあるか（一覧で目立たせる） */
  mentioned: boolean;
}

export interface ChatOverview {
  rooms: ChatRoomOverview[];
  totalUnread: number;
  /** 自分あてのメンションが残っているルーム数 */
  mentionedRooms: number;
}

/** リアクションに使える絵文字（LINEのスタンプ代わりの固定セット） */
export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "😢", "🎉"] as const;

/** 添付できるファイル（PDFなど。画像は image 側で扱う） */
export const CHAT_FILE_MIME = ["application/pdf"] as const;
export const CHAT_FILE_MAX_BYTES = 4_000_000;

export async function getChatOverview(
  db: DataStore,
  staffId: string,
  staffList?: Staff[]
): Promise<ChatOverview> {
  const [rooms, allStaff] = await Promise.all([
    db.listChatRooms(staffId),
    staffList ? Promise.resolve(staffList) : db.listStaff(),
  ]);
  if (rooms.length === 0) return { rooms: [], totalUnread: 0, mentionedRooms: 0 };

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
    const unreadMessages = me
      ? messages.filter((m) => m.senderId !== staffId && !m.deleted && m.createdAt > me.lastReadAt)
      : [];
    return {
      room,
      displayName: roomDisplayName(room, others),
      others,
      memberCount: roomMembers.length,
      lastMessage,
      unread: unreadMessages.length,
      mentioned: unreadMessages.some((m) => m.mentions.includes(staffId)),
    };
  });

  // 全体共有を先頭に固定し、そのあとは最後のメッセージが新しい順
  overviews.sort((a, b) => {
    const pin = Number(b.room.roomKey === ALL_ROOM_KEY) - Number(a.room.roomKey === ALL_ROOM_KEY);
    if (pin !== 0) return pin;
    return (
      (b.lastMessage?.createdAt.getTime() ?? b.room.createdAt.getTime()) -
      (a.lastMessage?.createdAt.getTime() ?? a.room.createdAt.getTime())
    );
  });

  return {
    rooms: overviews,
    totalUnread: overviews.reduce((sum, r) => sum + r.unread, 0),
    mentionedRooms: overviews.filter((r) => r.mentioned).length,
  };
}

/** ルームの表示名（DMは相手の名前、全体共有は固定名） */
export function roomDisplayName(room: ChatRoom, others: { name: string }[]): string {
  if (room.roomKey === ALL_ROOM_KEY) return ALL_ROOM_NAME;
  if (room.isGroup) return room.name || "グループ";
  return others.map((s) => s.name).join("、") || "（相手なし）";
}

/** メッセージ本文のプレビュー（一覧用） */
export function messagePreview(message: ChatMessage | null): string {
  if (!message) return "メッセージはまだありません";
  if (message.deleted) return "メッセージの送信を取り消しました";
  if (message.body) return message.body;
  if (message.image) return "📷 画像";
  if (message.file) return `📎 ${message.fileName || "ファイル"}`;
  return "";
}

/** 添付を持つメッセージだけ（写真一覧・ファイル一覧に使う） */
export function mediaMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !m.deleted && (m.image || m.file));
}

// ---- メンション ----

/**
 * 本文から @名前 を拾ってスタッフIDに変換する。
 * 表記ゆれに強くするため、姓名の空白は無視して前方一致で探す（「@大輝」でも当たる）。
 * 「@all」「@全員」はルームの全員あて。
 */
export function extractMentions(body: string, members: Staff[]): string[] {
  const found = new Set<string>();
  const matches = body.match(/@[^\s@、,。]+/g) ?? [];
  for (const raw of matches) {
    const token = raw.slice(1);
    if (!token) continue;
    if (token === "all" || token === "全員" || token === "みんな") {
      for (const m of members) found.add(m.id);
      continue;
    }
    const hit = members.find((m) => {
      const flat = m.name.replace(/\s+/g, "");
      return flat.startsWith(token) || token.startsWith(flat) || flat.includes(token);
    });
    if (hit) found.add(hit.id);
  }
  return [...found];
}

/** 本文を「文字」と「メンション」に分けて返す（表示側で色を付けるため） */
export function splitMentionParts(
  body: string,
  names: string[]
): { text: string; mention: boolean }[] {
  if (names.length === 0) return [{ text: body, mention: false }];
  // 長い名前から先に当てる（「大輝」より「山本大輝」を優先）
  const tokens = [...names, "all", "全員", "みんな"].sort((a, b) => b.length - a.length);
  const parts: { text: string; mention: boolean }[] = [];
  let rest = body;
  while (rest.length > 0) {
    const at = rest.indexOf("@");
    if (at === -1) {
      parts.push({ text: rest, mention: false });
      break;
    }
    if (at > 0) parts.push({ text: rest.slice(0, at), mention: false });
    const after = rest.slice(at + 1);
    const hit = tokens.find((t) => after.startsWith(t));
    if (hit) {
      parts.push({ text: `@${hit}`, mention: true });
      rest = after.slice(hit.length);
    } else {
      parts.push({ text: "@", mention: false });
      rest = after;
    }
  }
  return parts.filter((p) => p.text.length > 0);
}
