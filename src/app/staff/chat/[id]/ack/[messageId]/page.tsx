import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { ALL_ROOM_KEY, acknowledgementStatus, messagePreview } from "@/lib/chat";
import { isExecutive } from "@/lib/eni/access";
import { PageHeader, StatusBadge } from "@/components/ui";
import type { Staff } from "@/lib/data/types";

// 全体共有の1投稿の「確認しました」：押した人・まだの人の一覧。
// 見られるのは幹部と管理者だけ（それ以外はURLを直接開いてもトークへ戻す）。
export default async function AcknowledgementsPage({
  params,
}: {
  params: Promise<{ id: string; messageId: string }>;
}) {
  const session = await requireSession();
  const { id: roomId, messageId } = await params;
  const db = getDataStore();

  const room = await db.getChatRoom(roomId);
  if (!room || room.roomKey !== ALL_ROOM_KEY) redirect("/staff/chat");
  if (!(await isExecutive(session))) redirect(`/staff/chat/${roomId}`);
  const members = await db.listChatMembers([roomId]);
  if (!members.some((m) => m.staffId === session.staffId)) redirect("/staff/chat?error=forbidden");

  const [message] = await db.listChatMessagesByIds([messageId]);
  if (!message || message.roomId !== roomId || message.deleted) redirect(`/staff/chat/${roomId}`);

  const [staffList, acknowledgements] = await Promise.all([
    db.listStaff(),
    db.listChatAcknowledgements([messageId]),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const memberStaff = members.map((m) => staffMap.get(m.staffId)).filter((s): s is Staff => Boolean(s));
  const status = acknowledgementStatus(message, memberStaff, acknowledgements);
  const total = status.done.length + status.pending.length;

  return (
    <div className="page-narrow">
      <PageHeader
        title="確認しました"
        backHref={`/staff/chat/${roomId}?focus=${messageId}`}
        backLabel="全体共有へ戻る"
        description="この投稿を確認した人・まだの人（幹部・管理者だけが見られます）"
      />

      <section className="card mb-4">
        <p className="text-[11px] font-bold text-ink-500 mb-1">
          {staffMap.get(message.senderId)?.name ?? "（不明）"} ／ {formatDateTimeJa(message.createdAt)}
        </p>
        <p className="text-sm text-ink-800 whitespace-pre-wrap line-clamp-6">{messagePreview(message)}</p>
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge
            label={`確認 ${status.done.length}/${total}`}
            tone={status.pending.length === 0 ? "ok" : "warning"}
          />
          <Link href={`/staff/chat/${roomId}?focus=${messageId}`} className="text-[11px] font-bold text-brand-700 underline">
            トークで見る
          </Link>
        </div>
      </section>

      <section className="card mb-4 !p-0 overflow-hidden">
        <h2 className="px-4 pt-3.5 pb-2 text-sm font-bold text-ink-800 border-b border-ink-100">
          まだの人（{status.pending.length}人）
        </h2>
        {status.pending.length === 0 ? (
          <p className="px-4 py-3 text-sm text-emerald-700 font-bold">全員が確認しました</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {status.pending.map((s) => (
              <li key={s.id} className="px-4 py-2.5 text-sm font-bold text-ink-800">
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card !p-0 overflow-hidden">
        <h2 className="px-4 pt-3.5 pb-2 text-sm font-bold text-ink-800 border-b border-ink-100">
          確認した人（{status.done.length}人）
        </h2>
        {status.done.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-500">まだ誰も押していません</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {status.done.map(({ staff, at }) => (
              <li key={staff.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="flex-1 text-sm font-bold text-ink-800">{staff.name}</span>
                <span className="text-[11px] text-ink-500">{formatDateTimeJa(at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
