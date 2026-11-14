import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

// お知らせ（アプリ内の通知の一覧）。日報へのコメント・返信などが届く。
// 本人の分だけを出し、開いたら全部を既読にする（ヘッダーのベル・ホームの数字が消える）。
export default async function InboxPage() {
  const session = await requireSession();
  const db = getDataStore();
  const items = await db.listAppNotifications(session.staffId, 50);
  // 表示する分を取ってから既読にする（この画面では「新着」の印を残して見せる）
  if (items.some((n) => n.readAt === null)) await db.markAppNotificationsRead(session.staffId);

  return (
    <div className="page-narrow">
      <PageHeader title="お知らせ" backHref="/staff" description="日報へのコメント・返信などが届きます（新しい順・50件まで）。" />
      {items.length === 0 ? (
        <EmptyState message="お知らせはまだありません" />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href || "/staff"}
                className={`card card-tappable flex items-start gap-3 ${n.readAt === null ? "!border-brand-300 !bg-brand-50" : ""}`}
              >
                <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white border border-brand-200 grid place-items-center text-brand-600">
                  <Icon name={n.kind.startsWith("report") ? "pencil" : "bell"} className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink-900 truncate">{n.title}</span>
                    {n.readAt === null && (
                      <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white leading-4">新着</span>
                    )}
                  </span>
                  <span className="block text-sm text-ink-700 mt-0.5 break-words">{n.body}</span>
                  <span className="block text-[11px] text-ink-400 mt-1">{formatDateTimeJa(n.createdAt, true)}</span>
                </span>
                <Icon name="chevronRight" className="w-4 h-4 mt-2 shrink-0 text-ink-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
