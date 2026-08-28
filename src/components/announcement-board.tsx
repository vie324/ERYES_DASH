// 全体共有のアナウンスを取ってきて、ダッシュボード最上部に出す（表示は client 側の Announcements）。

import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { Announcements, type AnnouncementItem } from "@/components/announcements";

export async function AnnouncementBoard() {
  const db = getDataStore();
  const messages = await db.listAnnouncedChatMessages(5);
  if (messages.length === 0) return null;

  const staffList = await db.listStaff();
  const nameOf = (id: string) => staffList.find((s) => s.id === id)?.name ?? "（不明）";

  const items: AnnouncementItem[] = messages.map((m) => ({
    id: m.id,
    body: m.body || "（本文なし）",
    senderName: nameOf(m.announcedBy ?? m.senderId),
    when: formatDateTimeJa(m.announcedAt ?? m.createdAt),
    roomId: m.roomId,
  }));

  return <Announcements items={items} />;
}
