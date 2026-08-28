/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatDateTimeJa, formatTimeJa, jstDateOf } from "@/lib/date";
import {
  ALL_ROOM_KEY,
  CHAT_REACTION_EMOJIS,
  mediaMessages,
  messagePreview,
  roomDisplayName,
  splitMentionParts,
} from "@/lib/chat";
import { isExecutive } from "@/lib/eni/access";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AutoRefresh, ChatComposer, Lightbox, MemberPicker, ScrollToBottom } from "../chat-client";
import {
  deleteMessageAction,
  toggleAnnounceAction,
  togglePinAction,
  toggleReactionAction,
  updateGroupAction,
} from "../actions";
import type { ChatMessage, ChatReaction, Staff } from "@/lib/data/types";

const TABS = [
  { key: "talk", label: "トーク", icon: "chat" as const },
  { key: "notes", label: "ノート", icon: "book" as const },
  { key: "media", label: "写真・ファイル", icon: "fileText" as const },
  { key: "members", label: "メンバー", icon: "users" as const },
];

const FLASH: Record<string, string> = {
  members: "メンバーを更新しました",
  announced: "ダッシュボードのトップに掲示しました",
  unannounced: "掲示をやめました",
  forwarded: "議事録を転送しました（ノートにも残しています）",
};

// トークルーム（LINE風＋）：自分は右・相手は左の吹き出し。
// 既読数・リアクション・写真・PDF・返信・メンション・ノート（固定）・アナウンス。
// 数秒ごとの自動更新で新着を取り込む。開いている間は常に既読になる。
export default async function ChatRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; reply?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { id: roomId } = await params;
  const query = await searchParams;
  const tab = TABS.some((t) => t.key === query.tab) ? query.tab! : "talk";
  const db = getDataStore();

  const room = await db.getChatRoom(roomId);
  if (!room) redirect("/staff/chat");
  const members = await db.listChatMembers([roomId]);
  if (!members.some((m) => m.staffId === session.staffId)) {
    redirect("/staff/chat?error=forbidden");
  }

  // このトークを開いた＝ここまで既読
  await db.markChatRead(roomId, session.staffId);

  const [messages, staffList, pinned, isExec] = await Promise.all([
    db.listChatMessages(roomId, 200),
    db.listStaff(),
    db.listPinnedChatMessages(roomId),
    isExecutive(session),
  ]);
  const reactions = await db.listChatReactions(messages.map((m) => m.id));
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const nameOf = (id: string) => staffMap.get(id)?.name ?? "（不明）";

  const memberStaff = members
    .map((m) => staffMap.get(m.staffId))
    .filter((s): s is Staff => Boolean(s));
  const others = members.filter((m) => m.staffId !== session.staffId);
  const isAllRoom = room.roomKey === ALL_ROOM_KEY;
  const title = roomDisplayName(
    room,
    others.map((m) => ({ name: nameOf(m.staffId) }))
  );

  // 返信元・引用の表示に使う（本文中のIDから引く）
  const quotedIds = [...new Set(messages.map((m) => m.replyToId).filter(Boolean))];
  const quoted = new Map(
    (await db.listChatMessagesByIds(quotedIds)).map((m) => [m.id, m] as const)
  );
  const replyTarget = query.reply ? (quoted.get(query.reply) ?? messages.find((m) => m.id === query.reply)) : null;

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

  const media = mediaMessages(messages);
  const photos = media.filter((m) => m.image);
  const files = media.filter((m) => m.file);
  const memberNames = memberStaff.map((s) => s.name);

  return (
    <div className={`page-narrow ${tab === "talk" ? "pb-32" : "pb-8"}`}>
      <AutoRefresh seconds={5} />
      <PageHeader
        title={title}
        backHref="/staff/chat"
        backLabel="トークルーム一覧へ戻る"
        icon={isAllRoom ? "megaphone" : room.isGroup ? "users" : "user"}
        description={
          isAllRoom
            ? "全員が参加するルーム。大事な連絡はアナウンスにするとダッシュボードのトップに出ます"
            : room.isGroup
              ? `メンバー ${members.length}名`
              : undefined
        }
      />

      {query.saved && FLASH[query.saved] && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {FLASH[query.saved]}
        </p>
      )}
      {query.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {query.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* タブ（トーク／ノート／写真・ファイル／メンバー） */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => {
          const count =
            t.key === "notes" ? pinned.length : t.key === "media" ? media.length : t.key === "members" ? members.length : 0;
          return (
            <a
              key={t.key}
              href={`/staff/chat/${roomId}?tab=${t.key}`}
              className={`chip flex-1 justify-center !text-[11px] sm:!text-xs !py-2.5 ${
                tab === t.key ? "chip-active" : ""
              }`}
            >
              <Icon name={t.icon} className="w-3.5 h-3.5" />
              <span className="truncate">{t.label}</span>
              {count > 0 && <span className="opacity-70">{count}</span>}
            </a>
          );
        })}
      </div>

      {/* ---------------- トーク ---------------- */}
      {tab === "talk" && (
        <>
          {/* ノートのダイジェスト（大事な連絡を上に置いておく） */}
          {pinned.length > 0 && (
            <a
              href={`/staff/chat/${roomId}?tab=notes`}
              className="card !p-3 mb-4 flex items-center gap-2 border-brand-300 bg-brand-50/60"
            >
              <Icon name="book" className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold text-brand-700">ノート（{pinned.length}件）</span>
                <span className="block text-xs text-ink-600 truncate">{messagePreview(pinned[0])}</span>
              </span>
              <Icon name="chevronRight" className="w-4 h-4 text-brand-400 shrink-0" />
            </a>
          )}

          <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-center text-sm text-ink-400 py-8">最初のメッセージを送ってみましょう</p>
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
                    const quote = message.replyToId ? quoted.get(message.replyToId) : null;
                    const mentionsMe = message.mentions.includes(session.staffId);
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[86%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                          {!mine && (
                            <p className="text-[10px] font-bold text-ink-400 mb-0.5 px-1">
                              {nameOf(message.senderId)}
                            </p>
                          )}

                          {/* 返信元の引用 */}
                          {quote && !message.deleted && (
                            <div
                              className={`mb-1 max-w-full rounded-lg border-l-4 border-brand-300 bg-white/90 px-2 py-1 ${
                                mine ? "text-right" : ""
                              }`}
                            >
                              <span className="block text-[9px] font-bold text-brand-700">
                                {nameOf(quote.senderId)}
                              </span>
                              <span className="block text-[11px] text-ink-500 truncate">
                                {messagePreview(quote)}
                              </span>
                            </div>
                          )}

                          <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                            {/* 吹き出し */}
                            <div
                              className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                message.deleted
                                  ? "bg-ink-100 text-ink-400 italic"
                                  : mine
                                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white rounded-br-md"
                                    : mentionsMe
                                      ? "bg-amber-50 border-2 border-amber-300 text-ink-900 rounded-bl-md"
                                      : "bg-white border border-ink-200 text-ink-900 rounded-bl-md"
                              }`}
                            >
                              {message.deleted ? (
                                "メッセージの送信を取り消しました"
                              ) : (
                                <>
                                  {message.image && (
                                    <Lightbox
                                      src={message.image}
                                      alt="添付画像"
                                      className="block rounded-xl max-h-64 overflow-hidden mb-1.5 border border-black/5"
                                    />
                                  )}
                                  {message.file && (
                                    <a
                                      href={message.file}
                                      download={message.fileName || "資料.pdf"}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`flex items-center gap-2 rounded-xl px-2.5 py-2 mb-1.5 ${
                                        mine ? "bg-white/15" : "bg-brand-50 border border-brand-200"
                                      }`}
                                    >
                                      <Icon
                                        name="fileText"
                                        className={`w-5 h-5 shrink-0 ${mine ? "text-white" : "text-brand-600"}`}
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-xs font-bold truncate">
                                          {message.fileName || "資料.pdf"}
                                        </span>
                                        <span className={`block text-[10px] ${mine ? "text-white/70" : "text-ink-400"}`}>
                                          PDF・タップで開く
                                        </span>
                                      </span>
                                    </a>
                                  )}
                                  <MessageBody body={message.body} names={memberNames} mine={mine} />
                                </>
                              )}
                            </div>
                            {/* 時刻・既読 */}
                            <div
                              className={`shrink-0 text-[9px] font-bold text-ink-400 leading-tight ${
                                mine ? "text-right" : ""
                              }`}
                            >
                              {message.pinned && !message.deleted && (
                                <span className="block text-brand-600">ノート</span>
                              )}
                              {message.announcedAt && !message.deleted && (
                                <span className="block text-amber-600">掲示中</span>
                              )}
                              {mine && readCount > 0 && (
                                <span className="block text-brand-600">
                                  既読{room.isGroup ? ` ${readCount}` : ""}
                                </span>
                              )}
                              <span className="block">{formatTimeJa(message.createdAt)}</span>
                            </div>
                          </div>

                          {/* リアクション・操作 */}
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
                                      title={list.map((r) => nameOf(r.staffId)).join("、")}
                                    >
                                      {emoji} {list.length}
                                    </button>
                                  </form>
                                );
                              })}

                              {/* 返信 */}
                              <a
                                href={`/staff/chat/${roomId}?reply=${message.id}#composer`}
                                className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[10px] font-bold text-ink-500"
                              >
                                返信
                              </a>

                              {/* その他の操作 */}
                              <details className="relative">
                                <summary className="list-none cursor-pointer w-6 h-6 rounded-full border border-ink-200 bg-white text-ink-400 flex items-center justify-center hover:border-brand-300">
                                  <Icon name="plus" className="w-3 h-3" />
                                </summary>
                                <div
                                  className={`absolute z-10 mt-1 flex flex-wrap gap-1 rounded-xl border border-ink-200 bg-white px-2 py-1.5 shadow-lg w-56 ${
                                    mine ? "right-0" : "left-0"
                                  }`}
                                >
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
                                  <div className="w-full border-t border-ink-100 my-1" />
                                  <form action={togglePinAction} className="w-full">
                                    <input type="hidden" name="message_id" value={message.id} />
                                    <input type="hidden" name="room_id" value={roomId} />
                                    <input type="hidden" name="pinned" value={message.pinned ? "0" : "1"} />
                                    <button type="submit" className="w-full text-left text-[11px] font-bold text-brand-700 py-1">
                                      {message.pinned ? "ノートから外す" : "ノートに保存する"}
                                    </button>
                                  </form>
                                  {isAllRoom && isExec && (
                                    <form action={toggleAnnounceAction} className="w-full">
                                      <input type="hidden" name="message_id" value={message.id} />
                                      <input type="hidden" name="room_id" value={roomId} />
                                      <input type="hidden" name="announced" value={message.announcedAt ? "0" : "1"} />
                                      <button type="submit" className="w-full text-left text-[11px] font-bold text-amber-700 py-1">
                                        {message.announcedAt ? "掲示をやめる" : "アナウンス（トップに掲示）"}
                                      </button>
                                    </form>
                                  )}
                                  {mine && (
                                    <form action={deleteMessageAction} className="w-full">
                                      <input type="hidden" name="message_id" value={message.id} />
                                      <input type="hidden" name="room_id" value={roomId} />
                                      <button type="submit" className="w-full text-left text-[11px] font-bold text-red-500 py-1">
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

          <div id="composer" />
          <ChatComposer
            roomId={roomId}
            members={memberStaff
              .filter((s) => s.id !== session.staffId)
              .map((s) => ({ id: s.id, name: s.name }))}
            reply={
              replyTarget
                ? {
                    id: replyTarget.id,
                    senderName: nameOf(replyTarget.senderId),
                    preview: messagePreview(replyTarget),
                  }
                : null
            }
          />
        </>
      )}

      {/* ---------------- ノート ---------------- */}
      {tab === "notes" && (
        <section className="space-y-3">
          <p className="text-xs text-ink-500">
            大事な連絡・議事録をここにためておけます。トークのメッセージから「ノートに保存する」で追加できます。
          </p>
          {pinned.length === 0 ? (
            <p className="text-sm text-ink-400 py-6 text-center">まだノートはありません</p>
          ) : (
            pinned.map((m) => (
              <div key={m.id} className="card">
                <p className="text-[11px] font-bold text-ink-500 mb-1.5">
                  {nameOf(m.senderId)} ／ {formatDateTimeJa(m.createdAt)}
                </p>
                {m.image && (
                  <Lightbox
                    src={m.image}
                    alt="ノートの画像"
                    className="block rounded-xl max-h-64 overflow-hidden mb-2 border border-ink-200"
                  />
                )}
                {m.file && (
                  <a
                    href={m.file}
                    download={m.fileName || "資料.pdf"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-brand-50 border border-brand-200 px-2.5 py-2 mb-2"
                  >
                    <Icon name="fileText" className="w-5 h-5 text-brand-600 shrink-0" />
                    <span className="text-xs font-bold truncate">{m.fileName || "資料.pdf"}</span>
                  </a>
                )}
                <p className="text-sm whitespace-pre-wrap text-ink-800">{m.body}</p>
                <form action={togglePinAction} className="mt-2">
                  <input type="hidden" name="message_id" value={m.id} />
                  <input type="hidden" name="room_id" value={roomId} />
                  <input type="hidden" name="pinned" value="0" />
                  <button type="submit" className="text-[11px] font-bold text-red-500 underline">
                    ノートから外す
                  </button>
                </form>
              </div>
            ))
          )}
        </section>
      )}

      {/* ---------------- 写真・ファイル ---------------- */}
      {tab === "media" && (
        <section className="space-y-5">
          <div>
            <h2 className="section-title">写真（{photos.length}）</h2>
            {photos.length === 0 ? (
              <p className="text-sm text-ink-400">まだ写真はありません</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {photos.map((m) => (
                  <Lightbox
                    key={m.id}
                    src={m.image}
                    alt={`${nameOf(m.senderId)}の写真`}
                    className="block aspect-square rounded-lg overflow-hidden border border-ink-200 bg-white"
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="section-title">ファイル（{files.length}）</h2>
            {files.length === 0 ? (
              <p className="text-sm text-ink-400">まだファイルはありません</p>
            ) : (
              <div className="space-y-2">
                {files.map((m) => (
                  <a
                    key={m.id}
                    href={m.file}
                    download={m.fileName || "資料.pdf"}
                    target="_blank"
                    rel="noreferrer"
                    className="card !p-3 flex items-center gap-3"
                  >
                    <Icon name="fileText" className="w-5 h-5 text-brand-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-ink-900 truncate">
                        {m.fileName || "資料.pdf"}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {nameOf(m.senderId)} ／ {formatDateTimeJa(m.createdAt)}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------- メンバー ---------------- */}
      {tab === "members" && (
        <section className="space-y-4">
          <div className="card">
            <h2 className="section-title">参加中のメンバー（{memberStaff.length}名）</h2>
            <div className="flex flex-wrap gap-1.5">
              {memberStaff.map((s) => (
                <span key={s.id} className="chip">
                  {s.name}
                  {s.id === session.staffId && <span className="text-brand-600">（自分）</span>}
                </span>
              ))}
            </div>
          </div>

          {room.isGroup && !isAllRoom && (
            <form action={updateGroupAction} className="card space-y-3">
              <input type="hidden" name="room_id" value={roomId} />
              <div>
                <label className="label" htmlFor="room-name">グループ名</label>
                <input id="room-name" name="name" defaultValue={room.name} className="input" required />
              </div>
              <MemberPicker
                staff={staffList
                  .filter((s) => s.isActive)
                  .map((s) => ({ id: s.id, name: s.name }))}
                label="メンバー"
                selected={memberStaff.map((s) => s.id)}
              />
              <button type="submit" className="btn-secondary w-full">この内容で更新</button>
              <p className="text-[11px] text-ink-400">
                ※ 自分のチェックを外すとこのグループから抜けます（メッセージは残ります）。
              </p>
            </form>
          )}

          {isAllRoom && (
            <p className="text-xs text-ink-500">
              全体共有は在籍スタッフ全員が自動で参加します（メンバーの変更はできません）。
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** 本文の @メンション だけ色を変えて表示する */
function MessageBody({ body, names, mine }: { body: string; names: string[]; mine: boolean }) {
  if (!body) return null;
  const flatNames = names.map((n) => n.replace(/\s+/g, ""));
  const parts = splitMentionParts(body, [...flatNames, ...names]);
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span
            key={i}
            className={`font-bold rounded px-0.5 ${mine ? "bg-white/20" : "bg-brand-100 text-brand-800"}`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
