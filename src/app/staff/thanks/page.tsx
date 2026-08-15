import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa, jstDayBoundsUtc, monthRange, thisMonthJst } from "@/lib/date";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createThanksAction, createThanksCommentAction, toggleThanksLikeAction } from "./actions";

// 社内SNS（サンクスカード）：ありがとうをカードで贈り合う。
// タイムライン・いいね・コメント・月間ランキングで、感謝が見える文化をつくる。
// （thanks-gift.net のサンクスカードを参考にしたシンプル版）

const CARD_STYLES: Record<string, { label: string; card: string; chip: string }> = {
  gold: {
    label: "ゴールド",
    card: "from-amber-50 to-brand-100 border-brand-300",
    chip: "bg-gradient-to-br from-brand-400 to-brand-600",
  },
  rose: {
    label: "ローズ",
    card: "from-rose-50 to-rose-100 border-rose-300",
    chip: "bg-gradient-to-br from-rose-400 to-rose-500",
  },
  sky: {
    label: "スカイ",
    card: "from-sky-50 to-sky-100 border-sky-300",
    chip: "bg-gradient-to-br from-sky-400 to-sky-500",
  },
  mint: {
    label: "ミント",
    card: "from-emerald-50 to-emerald-100 border-emerald-300",
    chip: "bg-gradient-to-br from-emerald-400 to-emerald-500",
  },
};

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const month = thisMonthJst();
  const { from, to } = monthRange(month);
  const monthStart = jstDayBoundsUtc(from).start;
  const monthEnd = jstDayBoundsUtc(to).end;

  const [posts, staffList] = await Promise.all([
    db.listThanksPosts({ limit: 50 }),
    db.listStaff(),
  ]);
  const [likes, comments] = await Promise.all([
    db.listThanksLikes(posts.map((p) => p.id)),
    db.listThanksComments(posts.map((p) => p.id)),
  ]);
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const partners = staffList.filter((s) => s.isActive && s.id !== session.staffId);

  // 今月の集計（もらった・送った・ランキング）
  const monthPosts = posts.filter((p) => p.createdAt >= monthStart && p.createdAt < monthEnd);
  const receivedCount = monthPosts.filter((p) => p.toStaffId === session.staffId).length;
  const sentCount = monthPosts.filter((p) => p.fromStaffId === session.staffId).length;
  const receivedBy = new Map<string, number>();
  for (const p of monthPosts) {
    receivedBy.set(p.toStaffId, (receivedBy.get(p.toStaffId) ?? 0) + 1);
  }
  const ranking = [...receivedBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="page-narrow">
      <PageHeader
        title="サンクスカード"
        backHref="/staff"
        description="ありがとうをカードで贈り合って、感謝を見えるようにする社内SNSです"
        icon="heart"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          サンクスカードを送りました🎉
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください（自分宛てには送れません）
        </p>
      )}

      {/* 今月のようす */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="card !p-3.5 text-center">
          <p className="text-[11px] font-bold text-ink-500">今月もらった</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-0.5">
            {receivedCount}
            <span className="text-sm ml-0.5">枚</span>
          </p>
        </div>
        <div className="card !p-3.5 text-center">
          <p className="text-[11px] font-bold text-ink-500">今月送った</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-0.5">
            {sentCount}
            <span className="text-sm ml-0.5">枚</span>
          </p>
        </div>
      </div>

      {/* 今月のランキング */}
      {ranking.length > 0 && (
        <div className="card mb-4">
          <h2 className="section-title flex items-center gap-1.5">
            <Icon name="crown" className="w-4 h-4 text-brand-600" />
            今月たくさん「ありがとう」を受け取った人
          </h2>
          <div className="flex flex-wrap gap-2">
            {ranking.map(([staffId, count], i) => (
              <span
                key={staffId}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold ${
                  i === 0
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-ink-200 bg-white text-ink-700"
                }`}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                {staffNames.get(staffId) ?? "？"}
                <span className="text-xs text-ink-400">{count}枚</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 送信フォーム */}
      <details className="card mb-5 group" open={posts.length === 0}>
        <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-bold text-brand-700">
          <Icon name="heart" className="w-4 h-4" />
          サンクスカードを送る
          <span className="ml-auto text-brand-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <form action={createThanksAction} className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="thanks-to">
              誰に
            </label>
            <select id="thanks-to" name="to" className="input" required defaultValue="">
              <option value="" disabled>
                選んでください
              </option>
              {partners.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label !mb-2">カードの色</p>
            <div className="flex gap-2">
              {Object.entries(CARD_STYLES).map(([key, style], i) => (
                <label key={key} className="flex-1">
                  <input
                    type="radio"
                    name="card_color"
                    value={key}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span className="flex flex-col items-center gap-1 rounded-xl border-2 border-transparent bg-white px-2 py-2 cursor-pointer peer-checked:border-brand-400 peer-checked:bg-brand-50">
                    <span className={`w-7 h-7 rounded-full ${style.chip}`} />
                    <span className="text-[10px] font-bold text-ink-500">{style.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="thanks-body">
              ありがとうのメッセージ
            </label>
            <textarea
              id="thanks-body"
              name="body"
              rows={3}
              required
              placeholder="例）今日の忙しい時間、先回りして動いてくれて本当に助かりました！"
              className="input min-h-24"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="send" className="w-4 h-4" />
              カードを送る
            </span>
          </button>
        </form>
      </details>

      {/* タイムライン */}
      <h2 className="section-title">みんなの「ありがとう」</h2>
      {posts.length === 0 ? (
        <EmptyState message="まだ投稿がありません。最初のサンクスカードを送ってみましょう" />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const style = CARD_STYLES[post.cardColor] ?? CARD_STYLES.gold;
            const postLikes = likes.filter((l) => l.postId === post.id);
            const liked = postLikes.some((l) => l.staffId === session.staffId);
            const postComments = comments.filter((c) => c.postId === post.id);
            return (
              <div
                key={post.id}
                className={`rounded-2xl border bg-gradient-to-br p-4 ${style.card}`}
              >
                <p className="text-xs font-bold text-ink-600 flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-ink-900">{staffNames.get(post.fromStaffId) ?? "？"}</span>
                  <Icon name="chevronRight" className="w-3 h-3 text-ink-400" />
                  <span className="text-sm text-ink-900">{staffNames.get(post.toStaffId) ?? "？"}</span>
                  <span className="ml-auto text-[10px] text-ink-400">
                    {formatDateTimeJa(post.createdAt)}
                  </span>
                </p>
                <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed mt-2">
                  {post.body}
                </p>

                {/* いいね・コメント */}
                <div className="flex items-center gap-2 mt-3">
                  <form action={toggleThanksLikeAction}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <button
                      type="submit"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        liked
                          ? "border-rose-300 bg-rose-50 text-rose-600"
                          : "border-ink-200 bg-white/80 text-ink-500 hover:border-rose-300"
                      }`}
                    >
                      <Icon name="heart" className="w-3.5 h-3.5" />
                      いいね{postLikes.length > 0 && ` ${postLikes.length}`}
                    </button>
                  </form>
                  <span className="text-[11px] font-bold text-ink-400">
                    コメント {postComments.length}件
                  </span>
                </div>

                <details className="mt-2 group/comments">
                  <summary className="cursor-pointer list-none text-[11px] font-bold text-ink-500 underline">
                    コメントを見る・書く
                  </summary>
                  <div className="mt-2 space-y-2">
                    {postComments.map((c) => (
                      <div key={c.id} className="rounded-xl bg-white/80 border border-white px-3 py-2">
                        <p className="text-[10px] font-bold text-ink-400">
                          {staffNames.get(c.staffId) ?? "？"} ／ {formatDateTimeJa(c.createdAt)}
                        </p>
                        <p className="text-sm text-ink-800 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))}
                    <form action={createThanksCommentAction} className="flex gap-2">
                      <input type="hidden" name="post_id" value={post.id} />
                      <input
                        name="body"
                        className="input flex-1 !min-h-10 !py-2 !text-sm"
                        placeholder="コメントを書く"
                        required
                      />
                      <button
                        type="submit"
                        aria-label="コメントを送る"
                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-white border border-brand-300 text-brand-600"
                      >
                        <Icon name="send" className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
