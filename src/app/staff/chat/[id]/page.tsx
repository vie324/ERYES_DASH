/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatTimeJa, jstDateOf } from "@/lib/date";
import { CHAT_REACTION_EMOJIS } from "@/lib/chat";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AutoRefresh, ChatComposer, ScrollToBottom } from "../chat-client";
import { deleteMessageAction, toggleReactionAction } from "../actions";
import type { ChatMessage, ChatReaction } from "@/lib/data/types";

// トーク画面（LINE風）：自分は右・相手は左の吹き出し。既読数・リアクション・画像・送信取消。
// 数秒ごとの自動更新で新着を取り込む。開いている間は常に既読になる。
export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: roomId } = await params;
  const db = getDataStore();

  const room = await db.getChatRoom(roomId);
  if (!room) redirect("/staff/chat");
  const members = await db.listChatMembers([roomId]);
  if (!members.some((m) => m.staffId === session.staffId)) {
    redirect("/staff/chat?error=forbidden");
  }

  // このトークを開いた＝ここまで既読
  await db.markChatRead(roomId, session.staffId);

  const [messages, staffList] = await Promise.all([
    db.listChatMessages(roomId, 100),
    db.listStaff(),
  ]);
  const reactions = await db.listChatReactions(messages.map((m) => m.id));
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));

  const others = members.filter((m) => m.staffId !== session.staffId);
  const title = room!.isGroup
    ? room!.name || "グループ"
    : others.map((m) => staffNames.get(m.staffId) ?? "？").join("、");

  // 既読数：自分のメッセージを、自分以外の何人が読んだか
  const readCountOf = (message: ChatMessage) =>
    others.filter((m) => m.lastReadAt >= message.createdAt).length;

  // 日付ごとに区切って表示
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  for (const message of messages) {
    const date = jstDateOf(message.createdAt);
    const last = groups.at(-1);
    if (last && last.date === date) last.messages.push(message);
    else groups.push({ date, messages: [message] });
  }

  const reactionsOf = (messageId: string): Map<string, ChatReaction[]> => {
    const map = new Map<string, ChatReaction[]>();
    for (const r of reactions) {
      if (r.messageId !== messageId) continue;
      const list = map.get(r.emoji) ?? [];
      list.push(r);
      map.set(r.emoji, list);
    }
    return map;
  };

  return (
    <div className="page-narrow pb-24">
      <AutoRefresh seconds={5} />
      <PageHeader
        title={title}
        backHref="/staff/chat"
        backLabel="トーク一覧へ戻る"
        description={
          room!.isGroup
            ? `メンバー：${members.map((m) => staffNames.get(m.staffId) ?? "？").join("、")}`
            : undefined
        }
      />

      <div className="space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-ink-400 py-8">
            最初のメッセージを送ってみましょう
          </p>
        )}
        {groups.map((group) => (
          <div key={group.date}>
            <p className="text-center my-3">
              <span className="inline-block rounded-full bg-ink-100 text-ink-500 text-[11px] font-bold px-3 py-1">
                {formatDateJa(group.date)}
              </span>
            </p>
            <div className="space-y-2.5">
              {group.messages.map((message) => {
                const mine = message.senderId === session.staffId;
                const reactionMap = reactionsOf(message.id);
                const readCount = mine && !message.deleted ? readCountOf(message) : 0;
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!mine && (
                        <p className="text-[10px] font-bold text-ink-400 mb-0.5 px-1">
                          {staffNames.get(message.senderId) ?? "（不明）"}
                        </p>
                      )}
                      <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                        {/* 吹き出し */}
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            message.deleted
                              ? "bg-ink-100 text-ink-400 italic"
                              : mine
                                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white rounded-br-md"
                                : "bg-white border border-ink-200 text-ink-900 rounded-bl-md"
                          }`}
                        >
                          {message.deleted ? (
                            "メッセージの送信を取り消しました"
                          ) : (
                            <>
                              {message.image && (
                                <img
                                  src={message.image}
                                  alt="添付画像"
                                  className="rounded-xl max-h-64 mb-1.5 border border-black/5"
                                />
                              )}
                              {message.body}
                            </>
                          )}
                        </div>
                        {/* 時刻・既読 */}
                        <div className={`shrink-0 text-[9px] font-bold text-ink-400 leading-tight ${mine ? "text-right" : ""}`}>
                          {mine && readCount > 0 && (
                            <span className="block text-brand-600">
                              既読{room!.isGroup ? ` ${readCount}` : ""}
                            </span>
                          )}
                          <span className="block">{formatTimeJa(message.createdAt)}</span>
                        </div>
                      </div>

                      {/* リアクション */}
                      {!message.deleted && (
                        <div className={`flex flex-wrap items-center gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
                          {[...reactionMap.entries()].map(([emoji, list]) => {
                            const reacted = list.some((r) => r.staffId === session.staffId);
                            return (
                              <form key={emoji} action={toggleReactionAction}>
                                <input type="hidden" name="message_id" value={message.id} />
                                <input type="hidden" name="room_id" value={roomId} />
                                <input type="hidden" name="emoji" value={emoji} />
                                <button
                                  type="submit"
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold transition-colors ${
                                    reacted
                                      ? "border-brand-400 bg-brand-100 text-brand-800"
                                      : "border-ink-200 bg-white text-ink-600"
                                  }`}
                                  title={list.map((r) => staffNames.get(r.staffId) ?? "").join("、")}
                                >
                                  {emoji} {list.length}
                                </button>
                              </form>
                            );
                          })}
                          {/* リアクション追加・取消メニュー */}
                          <details className="relative">
                            <summary className="list-none cursor-pointer w-6 h-6 rounded-full border border-ink-200 bg-white text-ink-400 flex items-center justify-center hover:border-brand-300">
                              <Icon name="plus" className="w-3 h-3" />
                            </summary>
                            <div className={`absolute z-10 mt-1 flex gap-1 rounded-full border border-ink-200 bg-white px-2 py-1.5 shadow-lg ${mine ? "right-0" : "left-0"}`}>
                              {CHAT_REACTION_EMOJIS.map((emoji) => (
                                <form key={emoji} action={toggleReactionAction}>
                                  <input type="hidden" name="message_id" value={message.id} />
                                  <input type="hidden" name="room_id" value={roomId} />
                                  <input type="hidden" name="emoji" value={emoji} />
                                  <button type="submit" className="text-lg leading-none hover:scale-125 transition-transform">
                                    {emoji}
                                  </button>
                                </form>
                              ))}
                              {mine && (
                                <form action={deleteMessageAction} className="border-l border-ink-100 pl-2 ml-1 flex items-center">
                                  <input type="hidden" name="message_id" value={message.id} />
                                  <input type="hidden" name="room_id" value={roomId} />
                                  <button type="submit" className="text-[10px] font-bold text-red-500 whitespace-nowrap">
                                    送信取消
                                  </button>
                                </form>
                              )}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <ScrollToBottom />
      </div>

      <ChatComposer roomId={roomId} />
    </div>
  );
}
