import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatTimeJa, jstDateOf, todayJst } from "@/lib/date";
import { ALL_ROOM_KEY, getChatOverview, messagePreview } from "@/lib/chat";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AutoRefresh, MemberPicker, RoomSearch } from "./chat-client";
import { createGroupAction, startDmAction } from "./actions";

const FLASH: Record<string, { tone: "ok" | "error"; text: string }> = {
  "error=forbidden": { tone: "error", text: "このトークルームには参加していません" },
  "error=input": { tone: "error", text: "入力内容を確認してください" },
  "created=other": {
    tone: "ok",
    text: "自分が入らないグループを作成しました（参加していないルームは開けません）",
  },
  "left=1": { tone: "ok", text: "グループから抜けました" },
};

// トークルーム一覧：LINEのトーク一覧のように「相手・最後のメッセージ・未読数」を並べる。
// 全体共有は常に先頭。ここからDMの開始・グループの作成もできる。
export default async function ChatListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; left?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();

  const staffList = await db.listStaff();
  const activeStaff = staffList.filter((s) => s.isActive);
  // 全体共有は全員強制参加。一覧を開いたタイミングで、未参加の人をまとめて入れる
  await db.ensureAllRoom(activeStaff.map((s) => s.id));

  const overview = await getChatOverview(db, session.staffId, staffList);
  const partners = activeStaff.filter((s) => s.id !== session.staffId);

  const flashKey = params.error
    ? `error=${params.error}`
    : params.created
      ? `created=${params.created}`
      : params.left
        ? "left=1"
        : "";
  const flash = FLASH[flashKey];

  return (
    <div className="page-narrow">
      <AutoRefresh seconds={10} />
      <PageHeader
        title="トークルーム"
        backHref="/staff"
        description="全体共有・グループ・DM。ノート／写真／PDF／メンションが使えます"
        icon="chat"
      />

      {flash && (
        <p
          className={`rounded-xl text-sm font-bold px-4 py-3 mb-4 ${
            flash.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {flash.text}
        </p>
      )}

      {/* トーク一覧（名前・本文で絞り込める） */}
      <RoomSearch />
      <div className="space-y-2 mb-5" id="room-list">
        {overview.rooms.length === 0 ? (
          <EmptyState message="まだトークがありません。下からDMやグループを始めましょう" />
        ) : (
          overview.rooms.map(({ room, displayName, unread, lastMessage, memberCount, mentioned }) => {
            const isAll = room.roomKey === ALL_ROOM_KEY;
            const preview = messagePreview(lastMessage);
            return (
              <Link
                key={room.id}
                href={`/staff/chat/${room.id}`}
                data-room-search={`${displayName} ${preview}`.toLowerCase()}
                className={`card !p-3.5 flex items-center gap-3 hover:border-brand-300 transition-colors ${
                  isAll ? "border-brand-300 bg-brand-50/50" : ""
                }`}
              >
                <span
                  className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-display text-lg font-bold ${
                    isAll
                      ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white"
                      : room.isGroup
                        ? "bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 border border-brand-200"
                        : "bg-gradient-to-br from-brand-400 to-brand-700 text-white"
                  }`}
                >
                  {isAll ? (
                    <Icon name="megaphone" className="w-5 h-5" />
                  ) : room.isGroup ? (
                    <Icon name="users" className="w-5 h-5" />
                  ) : (
                    displayName.trim().charAt(0) || "？"
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-ink-900 truncate">
                      {displayName}
                      {room.isGroup && (
                        <span className="text-xs text-ink-400 font-normal ml-1">（{memberCount}）</span>
                      )}
                    </span>
                    {isAll && (
                      <span className="shrink-0 text-[9px] font-bold text-brand-700 border border-brand-300 rounded-full px-1.5 py-0.5">
                        全員
                      </span>
                    )}
                    {lastMessage && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold text-ink-400">
                        {jstDateOf(lastMessage.createdAt) === today
                          ? formatTimeJa(lastMessage.createdAt)
                          : formatDateJa(jstDateOf(lastMessage.createdAt))}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-500 truncate mt-0.5">{preview}</span>
                </span>
                {mentioned && (
                  <span className="shrink-0 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    @
                  </span>
                )}
                {unread > 0 && (
                  <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-white text-xs font-bold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* 新しいDM */}
      <details className="card mb-3 group">
        <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-bold text-brand-700">
          <Icon name="user" className="w-4 h-4" />
          1対1のトークを始める（DM）
          <span className="ml-auto text-brand-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {partners.map((s) => (
            <form key={s.id} action={startDmAction}>
              <input type="hidden" name="partner" value={s.id} />
              <button
                type="submit"
                className="w-full flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm font-bold text-ink-700 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xs font-display font-bold">
                  {s.name.trim().charAt(0)}
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            </form>
          ))}
        </div>
      </details>

      {/* 新しいグループ（自分が入らないグループも作れる） */}
      <details className="card group">
        <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-bold text-brand-700">
          <Icon name="users" className="w-4 h-4" />
          グループを作る
          <span className="ml-auto text-brand-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <form action={createGroupAction} className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="group-name">
              グループ名
            </label>
            <input
              id="group-name"
              name="name"
              className="input"
              placeholder="例）店舗連絡・イベント準備"
              required
            />
          </div>
          <MemberPicker
            staff={partners.map((s) => ({ id: s.id, name: s.name }))}
            label="メンバー（複数選択）"
          />
          <label className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold text-ink-700 has-checked:border-brand-400 has-checked:bg-brand-50">
            <input
              type="checkbox"
              name="join_self"
              defaultChecked
              className="h-4 w-4 accent-brand-500 shrink-0"
            />
            自分もこのグループに入る
          </label>
          <p className="text-[11px] text-ink-400 -mt-1">
            チェックを外すと、自分が入らないグループを作れます（メンバーだけのルームを用意したいとき）。
            ただし参加していないルームは開けません。
          </p>
          <button type="submit" className="btn-primary w-full">
            グループを作成する
          </button>
        </form>
      </details>
    </div>
  );
}
