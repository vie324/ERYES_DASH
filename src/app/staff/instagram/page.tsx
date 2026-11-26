import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore, isDemoMode } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { hasPermission } from "@/lib/permissions";
import { addDays, todayJst } from "@/lib/date";
import { getInstagramSettings, isInstagramConfigured, metricLabel } from "@/lib/instagram";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, MiniStat, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { connectDemoInstagramAction, disconnectInstagramAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "warning" | "danger" | "muted" | "pending" }> = {
  active: { label: "つながっています", tone: "ok" },
  demo: { label: "見本の数字（デモ）", tone: "pending" },
  expired: { label: "つなぎ直しが必要", tone: "danger" },
  error: { label: "読めませんでした", tone: "warning" },
  disconnected: { label: "つないでいません", tone: "muted" },
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 300},${70 - ((v - min) / span) * 60}`).join(" ");
  return (
    <svg viewBox="0 0 300 80" className="w-full h-20" role="img" aria-label="フォロワー数の推移">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="text-brand-500" />
    </svg>
  );
}

// 依頼22：自分のInstagramの数字（フォロワーの推移・前の日の数字・最近の投稿）。幹部は ?staff= で担当メンバーのものも見られる。
export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ staff?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const canTeam = v.isExec || v.isStoreManager || (await hasPermission(v.session, "instagram_team"));
  let target = v.me;
  if (params.staff && params.staff !== v.staffId) {
    const m = await db.getStaff(params.staff);
    if (!m || !(canSeeMember(v, m) || (await hasPermission(v.session, "instagram_team")))) redirect("/staff/instagram");
    target = m;
  }
  if (!target) redirect("/staff");
  const isSelf = target.id === v.staffId;
  const f = fx();
  const settings = await getInstagramSettings(db);
  const acc = await f.instagramAccounts.find({ staffId: target.id });
  const [days, media] = acc
    ? await Promise.all([
        f.instagramDaily.list({ where: { accountId: acc.id, date: { gte: addDays(todayJst(), -31) } }, order: [["date", "asc"]] }),
        f.instagramMedia.list({ where: { accountId: acc.id }, order: [["postedAt", "desc"]], limit: 12 }),
      ])
    : [[], []];
  const last = days[days.length - 1];
  const change = days.length >= 2 ? last.followers - days[0].followers : null;
  const sum30: Record<string, number> = {};
  for (const d of days) for (const [k, val] of Object.entries(d.metrics ?? {})) sum30[k] = (sum30[k] ?? 0) + (Number(val) || 0);
  const configured = isInstagramConfigured();
  const st = STATUS[acc?.status ?? "disconnected"] ?? STATUS.disconnected;
  const connected = acc && acc.status !== "disconnected";

  return (
    <div className="page-narrow">
      <PageHeader title={isSelf ? "Instagramの数字" : `${target.name}さんのInstagram`} backHref={isSelf ? "/staff" : "/staff/instagram/team"} backLabel={isSelf ? "ホームへ戻る" : "一覧へ戻る"} icon="trendingUp" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.instagramAccounts} isAdmin={v.isAdmin} />
      {canTeam && (
        <TabLinks
          items={[
            { href: "/staff/instagram", label: "自分", active: isSelf },
            { href: "/staff/instagram/team", label: "メンバー", active: !isSelf },
          ]}
        />
      )}

      <section className="card !p-3.5 mb-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold text-ink-900">{acc?.username ? `@${acc.username}` : "Instagram"}</p>
          <StatusBadge label={st.label} tone={st.tone} />
        </div>
        {acc?.lastFetchedAt && <p className="text-[11px] text-ink-500 mt-1">最後に集めた日時：{acc.lastFetchedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
        {acc?.lastError && <p className="text-[11px] text-amber-700 mt-1">{acc.lastError}</p>}
        {isSelf && (
          <div className="mt-3 space-y-2">
            {(!connected || acc?.status === "expired" || acc?.status === "error") &&
              (configured ? (
                <a href="/api/instagram/connect" className="btn-primary w-full">
                  {connected ? "Instagramをつなぎ直す" : "Instagramをつなぐ"}
                </a>
              ) : isDemoMode() ? (
                <form action={connectDemoInstagramAction}>
                  <button type="submit" className="btn-primary w-full">
                    見本の数字で試す（デモ）
                  </button>
                </form>
              ) : (
                <Note tone="warn">Instagramの連携の準備がまだです（管理者がMetaのアプリを登録すると、つなげるようになります）。</Note>
              ))}
            {!connected && (
              <Note>
                つなげるのはプロアカウント（クリエイター・ビジネス）だけです。Instagramのアプリの「設定 → アカウントの種類とツール」で切り替えられます。読むのは数字だけで、投稿やメッセージはしません。
              </Note>
            )}
            {connected && (
              <form action={disconnectInstagramAction}>
                <ConfirmSubmit message="Instagramとのつながりをやめますか？（これまでの数字は残ります）" className="text-xs text-red-600 underline">
                  つなぐのをやめる
                </ConfirmSubmit>
              </form>
            )}
          </div>
        )}
      </section>

      {days.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat label="フォロワー" value={last.followers.toLocaleString()} />
            <MiniStat label="30日の増減" value={change === null ? "—" : `${change >= 0 ? "+" : ""}${change}`} tone={change !== null && change < 0 ? "danger" : "ok"} />
            <MiniStat label={`前の日の${metricLabel(settings, "reach")}`} value={(last.metrics?.reach ?? 0).toLocaleString()} />
          </div>
          <section className="card !p-3.5 mb-4">
            <p className="text-[11px] font-bold text-ink-500">フォロワー数の推移（30日）</p>
            <Sparkline values={days.map((d) => d.followers)} />
            <div className="flex justify-between text-[10px] text-ink-400">
              <span>{days[0].date.slice(5).replace("-", "/")}</span>
              <span>{last.date.slice(5).replace("-", "/")}</span>
            </div>
          </section>
          <section className="card !p-3.5 mb-4">
            <p className="text-[11px] font-bold text-ink-500 mb-2">30日の合計</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {settings.accountMetrics
                .filter((k) => sum30[k] !== undefined)
                .map((k) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-ink-500 text-xs">{metricLabel(settings, k)}</dt>
                    <dd className="font-bold tabular-nums">{sum30[k].toLocaleString()}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </>
      )}

      {media.length > 0 && (
        <section className="mb-8">
          <p className="text-xs font-bold text-ink-500 mb-1.5">最近の投稿</p>
          <ul className="space-y-2">
            {media.map((m) => (
              <li key={m.id} className="card !p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-brand-700 shrink-0">{m.mediaType === "REELS" ? "リール" : m.mediaType === "CAROUSEL_ALBUM" ? "複数枚" : m.mediaType === "VIDEO" ? "動画" : "写真"}</span>
                  <span className="flex-1 min-w-0 text-sm truncate">{m.caption || "（文なし）"}</span>
                  <span className="text-[10px] text-ink-400 shrink-0">{m.postedAt?.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>
                </div>
                <p className="text-[11px] text-ink-600 mt-1 tabular-nums">
                  {["views", "reach", "likes", "saved", "shares", "comments"]
                    .filter((k) => m.metrics?.[k] !== undefined)
                    .map((k) => `${metricLabel(settings, k)} ${Number(m.metrics[k]).toLocaleString()}`)
                    .join("・")}
                </p>
                {m.permalink && (
                  <Link href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-brand-700">
                    Instagramで開く
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
