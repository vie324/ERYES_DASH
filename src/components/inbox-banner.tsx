// ホームのいちばん上に出す「お知らせ」の帯（未読があるときだけ）。
// 日報へのコメント・返信などは、自分から見に行かなくても、ホームを開けば必ず目に入るようにする。
// 未読が1件ならそのお知らせの画面へ、2件以上ならお知らせの一覧へ。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { Icon } from "@/components/icons";
import { openNotificationHref } from "@/lib/inbox";

export async function InboxBanner({ staffId, variant = "default" }: { staffId: string; variant?: "default" | "ios" }) {
  const db = getDataStore();
  const [count, latest] = await Promise.all([
    db.countUnreadAppNotifications(staffId),
    db.listAppNotifications(staffId, 1),
  ]);
  if (count === 0) return null;
  const top = latest[0];
  // 1件なら、既読にしてからその画面へ（/staff/inbox/open）。2件以上ならお知らせの一覧へ
  const href =
    count === 1 && top && top.readAt === null && top.href
      ? openNotificationHref(top)
      : "/staff/inbox";
  const box =
    variant === "ios"
      ? "ios-card !p-3.5 flex items-center gap-3 mt-4"
      : "flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 mb-4 transition-shadow hover:shadow-[0_6px_20px_rgba(93,80,58,0.12)]";
  // 既読にして開くリンクは、ふつうのページ移動にする（画面内の移動だとヘッダーのベルが描き直されず、数字が残るため）
  const Wrapper = href.startsWith("/staff/inbox/open")
    ? ({ children }: { children: React.ReactNode }) => (
        <a href={href} className={box}>
          {children}
        </a>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <Link href={href} className={box}>
          {children}
        </Link>
      );
  return (
    <Wrapper>
      <span className="relative w-10 h-10 shrink-0 rounded-xl bg-red-500 text-white grid place-items-center">
        <Icon name="bell" className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-900">
          お知らせが {count}件 あります
        </span>
        {top && top.readAt === null && (
          <span className="block text-xs text-ink-600 mt-0.5 truncate">
            {top.title}：{top.body}
          </span>
        )}
      </span>
      <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-ink-400" />
    </Wrapper>
  );
}
