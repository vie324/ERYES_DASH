/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatDateTimeJa, formatTimeJa, jstDateOf } from "@/lib/date";
import {
  ALL_ROOM_KEY,
  avatarColor,
  mediaMessages,
  messagePreview,
  roomDisplayName,
  splitMentionParts,
} from "@/lib/chat";
import { isExecutive } from "@/lib/eni/access";
import { Icon } from "@/components/icons";
import {
  AutoRefresh,
  ChatComposer,
  ChatRoomFrame,
  ChatRoomProvider,
  ChatScroller,
  Lightbox,
  MemberPicker,
  MessageActions,
  RoomMenu,
} from "../chat-client";
import { togglePinAction, toggleReactionAction, updateGroupAction } from "../actions";
import type { ChatMessage, ChatReaction, Staff } from "@/lib/data/types";

const TAB_LABELS: Record<string, string> = {
  talk: "トーク",
  notes: "ノート",
  media: "写真・ファイル",
  members: "メンバー",
};

const FLASH: Record<string, string> = {
  members: "メンバーを更新しました",
  forwarded: "議事録を転送しました（ノートにも残しています）",
};

/** 同じ人の続けての発言とみなす間隔（これ以内ならアイコン・名前を省いてまとめる） */
const RUN_GAP_MS = 10 * 60 * 1000;

// トークルーム（見た目はLINEに合わせる）：青い背景に、自分は右の緑・相手は左の白の吹き出し。
// 既読数・リアクション・写真・PDF・リプライ・メンション・ノート・アナウンス。
// 吹き出しをタップ（写真は長押し）するとメニューが出る。数秒ごとの自動更新で新着を取り込み、
// 開いている間は常に既読になる。画面いっぱいで使い、左上の「＜」でトーク一覧へ戻る。
export default async function ChatRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { id: roomId } = await params;
  const query = await searchParams;
  const tab = query.tab && query.tab in TAB_LABELS ? query.tab : "talk";
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

  // リプライの引用元（本文中のIDから引く）
  const quotedIds = [...new Set(messages.map((m) => m.replyToId).filter(Boolean))];
  const quoted = new Map(
    (await db.listChatMessagesByIds(quotedIds)).map((m) => [m.id, m] as const)
  );

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
  const lastMessage = messages.at(-1) ?? null;
  const flash = query.saved ? FLASH[query.saved] : "";

  return (
    <ChatRoomFrame tone={tab === "talk" ? "talk" : "sheet"}>
      <AutoRefresh seconds={5} />

      {/* 見出し（LINEと同じく、左に戻る・真ん中に名前・右にメニュー） */}
      <header
        className={`shrink-0 pt-[env(safe-area-inset-top)] ${
          tab === "talk" ? "bg-[var(--line-bg)]" : "bg-white border-b border-black/10"
        }`}
      >
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-0.5 px-1">
          <Link
            href={tab === "talk" ? "/staff/chat" : `/staff/chat/${roomId}`}
            aria-label={tab === "talk" ? "トーク一覧へ戻る" : "トークへ戻る"}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-[#111] active:bg-black/10"
          >
            <Icon name="chevronLeft" className="w-7 h-7" />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            {tab === "talk" ? (
              <h1 className="truncate text-[17px] font-bold text-[#111]">
                {title}
                {room.isGroup && <span className="ml-0.5 font-normal">({members.length})</span>}
              </h1>
            ) : (
              <>
                <h1 className="truncate text-[16px] font-bold text-[#111]">{TAB_LABELS[tab]}</h1>
                <p className="truncate text-[11px] text-[#777]">{title}</p>
              </>
            )}
          </div>
          <RoomMenu
            roomId={roomId}
            current={tab}
            counts={{ notes: pinned.length, media: media.length, members: members.length }}
          />
        </div>
      </header>

      {flash && (
        <p className="shrink-0 bg-emerald-50 px-4 py-2 text-center text-xs font-bold text-emerald-700">{flash}</p>
      )}
      {query.error && (
        <p className="shrink-0 bg-red-50 px-4 py-2 text-center text-xs font-bold text-red-600">
          {query.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* ---------------- トーク ---------------- */}
      {tab === "talk" && (
        <ChatRoomProvider>
          {/* ノート（大事な連絡）を見出しの下に掲示しておく（LINEのアナウンスの位置） */}
          {pinned.length > 0 && (
            <div className="shrink-0 px-2 pb-1.5">
              <Link
                href={`/staff/chat/${roomId}?tab=notes`}
                className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl bg-white/95 px-3 py-2 shadow-sm"
              >
                <Icon name="megaphone" className="w-4 h-4 shrink-0 text-[var(--line-green)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold text-[#777]">ノート（{pinned.length}件）</span>
                  <span className="block truncate text-xs text-[#222]">{messagePreview(pinned[0])}</span>
                </span>
                <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-[#aaa]" />
              </Link>
            </div>
          )}

          <ChatScroller lastKey={lastMessage?.id ?? ""} lastMine={lastMessage?.senderId === session.staffId}>
            <div className="mx-auto max-w-3xl pt-1 pb-4">
              {messages.length === 0 && (
                <p className="mt-10 text-center">
                  <span className="line-pill">最初のメッセージを送ってみましょう</span>
                </p>
              )}
              {groups.map((group) => (
                <section key={group.date}>
                  <p className="mt-4 mb-1 text-center">
                    <span className="line-pill">{formatDateJa(group.date)}</span>
                  </p>
                  {group.messages.map((message, i) => {
                    const prev = group.messages[i - 1];
                    // 同じ人が続けて送ったときは、2つ目からアイコン・名前・しっぽを省く（LINEと同じ）
                    const continued =
                      Boolean(prev) &&
                      prev.senderId === message.senderId &&
                      !prev.deleted &&
                      message.createdAt.getTime() - prev.createdAt.getTime() < RUN_GAP_MS;
                    const mine = message.senderId === session.staffId;
                    const quote = message.replyToId ? (quoted.get(message.replyToId) ?? null) : null;
                    return (
                      <MessageRow
                        key={message.id}
                        message={message}
                        roomId={roomId}
                        mine={mine}
                        first={!continued}
                        showName={room.isGroup}
                        senderName={nameOf(message.senderId)}
                        quote={quote}
                        quoteName={quote ? nameOf(quote.senderId) : ""}
                        readCount={mine && !message.deleted ? readCountOf(message) : 0}
                        showReadCount={room.isGroup}
                        reactions={reactionsOf(message.id)}
                        myStaffId={session.staffId}
                        reactionNames={(list) => list.map((r) => nameOf(r.staffId)).join("、")}
                        memberNames={memberNames}
                        canAnnounce={isAllRoom && isExec}
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          </ChatScroller>

          <ChatComposer
            roomId={roomId}
            members={memberStaff
              .filter((s) => s.id !== session.staffId)
              .map((s) => ({ id: s.id, name: s.name }))}
          />
        </ChatRoomProvider>
      )}

      {/* ---------------- ノート・写真・ファイル・メンバー ---------------- */}
      {tab !== "talk" && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-3xl px-3 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {tab === "notes" && (
              <section className="space-y-3">
                <p className="text-xs text-ink-500">
                  大事な連絡・議事録をここにためておけます。トークの吹き出しをタップして「ノート保存」で追加できます。
                </p>
                {pinned.length === 0 ? (
                  <p className="text-sm text-ink-400 py-6 text-center">まだノートはありません</p>
                ) : (
                  pinned.map((m) => (
                    <div key={m.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
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
                          className="flex items-center gap-2 rounded-xl bg-[#f5f6f8] px-2.5 py-2 mb-2"
                        >
                          <Icon name="fileText" className="w-5 h-5 text-[#e0463a] shrink-0" />
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

            {tab === "media" && (
              <section className="space-y-5">
                <div>
                  <h2 className="mb-2 text-sm font-bold text-[#333]">写真（{photos.length}）</h2>
                  {photos.length === 0 ? (
                    <p className="text-sm text-ink-400">まだ写真はありません</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                      {photos.map((m) => (
                        <Lightbox
                          key={m.id}
                          src={m.image}
                          alt={`${nameOf(m.senderId)}の写真`}
                          className="block aspect-square overflow-hidden bg-white"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="mb-2 text-sm font-bold text-[#333]">ファイル（{files.length}）</h2>
                  {files.length === 0 ? (
                    <p className="text-sm text-ink-400">まだファイルはありません</p>
                  ) : (
                    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                      {files.map((m, i) => (
                        <a
                          key={m.id}
                          href={m.file}
                          download={m.fileName || "資料.pdf"}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-black/5" : ""}`}
                        >
                          <PdfBadge />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-[#111] truncate">
                              {m.fileName || "資料.pdf"}
                            </span>
                            <span className="block text-[11px] text-[#888]">
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

            {tab === "members" && (
              <section className="space-y-4">
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                  <p className="px-4 pt-3 pb-1 text-xs font-bold text-[#888]">参加中のメンバー（{memberStaff.length}名）</p>
                  {memberStaff.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={s.name} id={s.id} size="sm" />
                      <span className="flex-1 min-w-0 truncate text-sm font-bold text-[#111]">
                        {s.name}
                        {s.id === session.staffId && <span className="ml-1 text-xs text-[#888]">（自分）</span>}
                      </span>
                    </div>
                  ))}
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
        </div>
      )}
    </ChatRoomFrame>
  );
}

/** 1通ぶんの表示（相手は左にアイコン＋白い吹き出し、自分は右に緑の吹き出し） */
function MessageRow({
  message,
  roomId,
  mine,
  first,
  showName,
  senderName,
  quote,
  quoteName,
  readCount,
  showReadCount,
  reactions,
  myStaffId,
  reactionNames,
  memberNames,
  canAnnounce,
}: {
  message: ChatMessage;
  roomId: string;
  mine: boolean;
  /** 続けて送られた吹き出しの1つ目か（アイコン・名前・しっぽを出す） */
  first: boolean;
  /** 相手の名前を出すか（グループのみ。1対1では出さない） */
  showName: boolean;
  senderName: string;
  quote: ChatMessage | null;
  quoteName: string;
  readCount: number;
  /** 既読の人数を出すか（グループのみ。1対1は「既読」だけ） */
  showReadCount: boolean;
  reactions: Map<string, ChatReaction[]>;
  myStaffId: string;
  reactionNames: (list: ChatReaction[]) => string;
  memberNames: string[];
  canAnnounce: boolean;
}) {
  // 送信取消はLINEと同じく、真ん中のお知らせとして出す
  if (message.deleted) {
    return (
      <p className="my-2 px-4 text-center">
        <span className="line-pill">
          {mine ? "メッセージの送信を取り消しました" : `${senderName}がメッセージの送信を取り消しました`}
        </span>
      </p>
    );
  }

  const hasText = Boolean(message.body) || Boolean(quote);
  // しっぽは、いちばん上に来る吹き出し（ファイル or 本文）にだけ付ける。写真が上なら付けない
  const tail = first && !message.image;
  const bubbleTone = mine ? "line-bubble-out" : "line-bubble-in";
  const tailClass = mine ? "line-tail-out" : "line-tail-in";

  const content = (
    <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      {message.image && (
        <Lightbox
          src={message.image}
          alt="添付の写真"
          className="line-no-callout block max-w-[min(15rem,100%)] overflow-hidden rounded-2xl bg-white/40"
          imgClassName="block w-full h-auto max-h-80 object-cover"
        />
      )}
      {message.file && (
        <a
          href={message.file}
          download={message.fileName || "資料.pdf"}
          target="_blank"
          rel="noreferrer"
          className={`line-bubble line-bubble-in ${tail ? (mine ? "line-tail-out" : "line-tail-in") : ""} flex w-60 max-w-full items-center gap-2.5 whitespace-normal py-2.5`}
        >
          <PdfBadge />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{message.fileName || "資料.pdf"}</span>
            <span className="block text-[11px] text-[#888]">PDF・タップで開く</span>
          </span>
        </a>
      )}
      {hasText && (
        <div className={`line-bubble ${bubbleTone} ${tail && !message.file ? tailClass : ""}`}>
          {/* 引用は1行に切り詰める（truncate だと長い引用の幅で吹き出しが時刻に重なるので line-clamp） */}
          {quote && (
            <span className="mb-1.5 block border-b border-black/10 pb-1.5 text-[12px] leading-snug">
              <span className="line-clamp-1 font-bold text-black/70">{quoteName}</span>
              <span className="line-clamp-1 text-black/55">{messagePreview(quote)}</span>
            </span>
          )}
          <MessageBody body={message.body} names={memberNames} />
        </div>
      )}
    </div>
  );

  const labels = (
    <>
      {message.pinned && <span className="block font-bold text-[#0b7a3b]">ノート</span>}
      {message.announcedAt && <span className="block font-bold text-[#8a4b00]">掲示中</span>}
    </>
  );

  const actions = (
    <MessageActions
      messageId={message.id}
      roomId={roomId}
      mine={mine}
      text={message.body}
      senderName={senderName}
      preview={messagePreview(message)}
      pinned={message.pinned}
      canAnnounce={canAnnounce}
      announced={Boolean(message.announcedAt)}
      className="min-w-0 max-w-[calc(100%-3rem)]"
    >
      {content}
    </MessageActions>
  );

  const reactionRow =
    reactions.size > 0 ? (
      <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
        {[...reactions.entries()].map(([emoji, list]) => {
          const reacted = list.some((r) => r.staffId === myStaffId);
          return (
            <form key={emoji} action={toggleReactionAction}>
              <input type="hidden" name="message_id" value={message.id} />
              <input type="hidden" name="room_id" value={roomId} />
              <input type="hidden" name="emoji" value={emoji} />
              <button
                type="submit"
                title={reactionNames(list)}
                aria-label={`${emoji} ${list.length}人（${reacted ? "押すと取り消し" : "押すと自分も付ける"}）`}
                className={`inline-flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[13px] leading-none shadow-sm ${
                  reacted ? "ring-2 ring-[var(--line-green)]" : ""
                }`}
              >
                {emoji}
                <span className="text-[11px] font-bold text-[#444]">{list.length}</span>
              </button>
            </form>
          );
        })}
      </div>
    ) : null;

  if (mine) {
    return (
      <div className={`flex justify-end pl-14 pr-3 ${first ? "mt-3" : "mt-1"}`}>
        <div className="flex min-w-0 flex-1 flex-col items-end">
          {/* 行は幅いっぱいにしておく（吹き出しの最大幅＝行の幅−時刻の欄。行を中身の幅にすると短い文でも折り返してしまう） */}
          <div className="flex w-full items-end justify-end gap-1.5">
            {/* 既読・時刻は吹き出しの左下（LINEと同じ位置） */}
            <div className="line-meta shrink-0 pb-0.5 text-right">
              {labels}
              {readCount > 0 && <span className="block">既読{showReadCount ? ` ${readCount}` : ""}</span>}
              <span className="block">{formatTimeJa(message.createdAt)}</span>
            </div>
            {actions}
          </div>
          {reactionRow}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 pl-2.5 pr-12 ${first ? "mt-3" : "mt-1"}`}>
      <div className="w-9 shrink-0">{first && <Avatar name={senderName} id={message.senderId} />}</div>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        {first && showName && <p className="line-meta mb-1 max-w-full truncate px-0.5 text-[11px]">{senderName}</p>}
        <div className="flex w-full items-end gap-1.5">
          {actions}
          <div className="line-meta shrink-0 pb-0.5">
            {labels}
            <span className="block">{formatTimeJa(message.createdAt)}</span>
          </div>
        </div>
        {reactionRow}
      </div>
    </div>
  );
}

/** 本文の @メンション だけ青くして表示する（LINEと同じ） */
function MessageBody({ body, names }: { body: string; names: string[] }) {
  if (!body) return null;
  const flatNames = names.map((n) => n.replace(/\s+/g, ""));
  const parts = splitMentionParts(body, [...flatNames, ...names]);
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} className="font-bold text-[#1d4ed8]">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/** アイコン（写真の代わりに名前の頭文字。色は人ごとに固定） */
function Avatar({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
        size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm"
      }`}
      style={{ backgroundColor: avatarColor(id) }}
      aria-hidden="true"
    >
      {name.trim().charAt(0) || "？"}
    </span>
  );
}

/** PDFの目印（LINEのファイル表示のように、赤い四角に「PDF」） */
function PdfBadge() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e0463a] text-[10px] font-bold text-white">
      PDF
    </span>
  );
}
