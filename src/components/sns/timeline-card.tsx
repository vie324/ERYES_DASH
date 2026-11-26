// 社内SNSのタイムラインの1件（いい事例・サンクス・表彰の発表）。一覧と詳細の両方で使う。

import Link from "next/link";
import { formatDateTimeJa, formatDateJa } from "@/lib/date";
import { Icon } from "@/components/icons";
import { PhotoGrid } from "@/components/sns/photo-parts";
import { addCommentAction, deleteCommentAction, deletePostAction, toggleLikeAction, togglePinAction } from "@/app/staff/sns/actions";
import type { TimelineItem } from "@/lib/sns";

const CARD_TONE: Record<string, string> = {
  gold: "from-amber-50 to-brand-100 border-brand-300",
  rose: "from-rose-50 to-rose-100 border-rose-300",
  sky: "from-sky-50 to-sky-100 border-sky-300",
  mint: "from-emerald-50 to-emerald-100 border-emerald-300",
};

export interface CardContext {
  viewerId: string;
  isAdmin: boolean;
  isExec: boolean;
  nameOf: (id: string | null) => string;
  storeName: (id: string | null) => string;
  /** この画面のURL（いいね・コメントのあとに戻る先） */
  back: string;
  unread: Set<string>;
  /** 詳細画面ではコメントを全部・入力欄を開いて出す */
  detail?: boolean;
}

export function TimelineCard({ item, ctx }: { item: TimelineItem; ctx: CardContext }) {
  const unread = ctx.unread.has(item.id);
  if (item.type === "thanks") {
    const t = item.thanks;
    const tone = CARD_TONE[t.cardColor] ?? CARD_TONE.gold;
    const from = t.fromStaffId ? ctx.nameOf(t.fromStaffId) : t.fromName || "？";
    const to = t.toStaffId ? ctx.nameOf(t.toStaffId) : t.toName || "？";
    return (
      <article id={`t-${item.id}`} className={`rounded-2xl border bg-gradient-to-br p-4 scroll-mt-20 ${tone}`}>
        <header className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-ink-600">
          <span className="rounded-full bg-white/80 border border-white px-2 py-0.5 text-[11px] text-rose-600">サンクス</span>
          {t.kind === "import" && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-ink-500">過去のカード</span>}
          {t.isPrivate && <span className="rounded-full bg-ink-800 text-white px-2 py-0.5 text-[11px]">非公開</span>}
          {unread && <span className="rounded-full bg-red-500 text-white px-2 py-0.5 text-[11px]">未読</span>}
          <span className="ml-auto text-[11px] text-ink-400">{t.kind === "import" ? formatDateJa(t.date, true) : formatDateTimeJa(t.createdAt)}</span>
        </header>
        <p className="mt-2 text-sm font-bold text-ink-900 flex items-center gap-1.5 flex-wrap">
          {from}
          <Icon name="chevronRight" className="w-3 h-3 text-ink-400" />
          {to}
          {t.stamp && <span className="text-xl leading-none ml-1">{t.stamp}</span>}
          {t.points > 0 && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-amber-700 border border-amber-200">{t.points}pt</span>}
        </p>
        <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed mt-1.5">{t.body}</p>
        {t.kind === "app" && <Reactions item={item} ctx={ctx} />}
      </article>
    );
  }

  const p = item.post;
  const isAward = p.kind === "award";
  const mine = p.authorStaffId === ctx.viewerId;
  return (
    <article id={`p-${item.id}`} className={`card scroll-mt-20 ${isAward ? "!border-amber-300 bg-gradient-to-br from-amber-50 to-white" : ""}`}>
      <header className="flex items-center gap-2.5">
        <span className="w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-800 grid place-items-center text-sm font-bold">
          {isAward ? "🏆" : ctx.nameOf(p.authorStaffId).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900 truncate">
            {isAward ? "月間サンクス表彰" : ctx.nameOf(p.authorStaffId)}
            {!isAward && p.storeId && <span className="ml-1.5 text-[11px] font-bold text-ink-400">{ctx.storeName(p.storeId)}</span>}
          </p>
          <p className="text-[11px] text-ink-400">{formatDateTimeJa(p.createdAt)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {p.pinnedAt && <span className="rounded-full bg-brand-600 text-white px-2 py-0.5 text-[11px] font-bold">固定</span>}
          {unread && <span className="rounded-full bg-red-500 text-white px-2 py-0.5 text-[11px] font-bold">未読</span>}
          {!isAward && <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-bold text-brand-700">{p.category}</span>}
        </div>
      </header>
      {p.body && <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed mt-2.5">{p.body}</p>}
      <PhotoGrid photos={p.photos} />
      <Reactions item={item} ctx={ctx} />
      {(ctx.isExec || mine || ctx.isAdmin) && (
        <div className="flex gap-2 mt-2 justify-end">
          {ctx.isExec && (
            <form action={togglePinAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="back" value={ctx.back} />
              <button type="submit" className="btn-ghost !text-xs !px-2 !py-1">
                {p.pinnedAt ? "固定を外す" : "上に固定"}
              </button>
            </form>
          )}
          {(mine || ctx.isAdmin) && (
            <form action={deletePostAction}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="btn-ghost !text-xs !px-2 !py-1 !text-red-500">
                消す
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

function Reactions({ item, ctx }: { item: TimelineItem; ctx: CardContext }) {
  const detailHref = item.type === "post" ? `/staff/sns/post/${item.id}` : `/staff/sns/thanks/${item.id}`;
  const shown = ctx.detail ? item.comments : item.comments.slice(-2);
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <form action={toggleLikeAction}>
          <input type="hidden" name="type" value={item.type} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="back" value={`${ctx.back}#${item.type === "post" ? "p" : "t"}-${item.id}`} />
          <button
            type="submit"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold min-h-9 ${
              item.liked ? "border-rose-300 bg-rose-50 text-rose-600" : "border-ink-200 bg-white/80 text-ink-500"
            }`}
            aria-pressed={item.liked}
          >
            <Icon name="heart" className="w-3.5 h-3.5" />
            いいね{item.likeCount > 0 ? ` ${item.likeCount}` : ""}
          </button>
        </form>
        <Link href={detailHref} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-ink-500 min-h-9">
          <Icon name="chat" className="w-3.5 h-3.5" />
          コメント{item.comments.length > 0 ? ` ${item.comments.length}` : ""}
        </Link>
      </div>
      {shown.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {!ctx.detail && item.comments.length > shown.length && (
            <li>
              <Link href={detailHref} className="text-[11px] font-bold text-ink-500 underline">
                コメントをすべて見る（{item.comments.length}件）
              </Link>
            </li>
          )}
          {shown.map((c) => (
            <li key={c.id} className="rounded-xl bg-white/85 border border-ink-100 px-3 py-2">
              <p className="text-[11px] font-bold text-ink-500 flex items-center gap-2">
                {ctx.nameOf(c.staffId)}
                <span className="font-normal text-ink-400">{formatDateTimeJa(c.createdAt)}</span>
                {item.type === "post" && (c.staffId === ctx.viewerId || ctx.isAdmin) && ctx.detail && (
                  <form action={deleteCommentAction} className="ml-auto">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="back" value={ctx.back} />
                    <button type="submit" className="text-[11px] text-red-500 underline">
                      消す
                    </button>
                  </form>
                )}
              </p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {ctx.detail && (
        <form action={addCommentAction} className="flex gap-2 mt-2">
          <input type="hidden" name="type" value={item.type} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="back" value={ctx.back} />
          <input name="body" className="input flex-1 !min-h-11 !py-2 !text-sm" placeholder="コメントを書く" required maxLength={500} />
          <button type="submit" aria-label="コメントを送る" className="w-11 h-11 shrink-0 grid place-items-center rounded-xl bg-brand-600 text-white">
            <Icon name="send" className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
