import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { thisMonthJst } from "@/lib/date";
import { buildTimeline, getSnsSettings, pointsUsedInMonth, unreadRefIds, type TimelineTab } from "@/lib/sns";
import { snsPosts } from "@/lib/data/tables";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";
import { TimelineCard, type CardContext } from "@/components/sns/timeline-card";

export const dynamic = "force-dynamic";

const TABS: { key: TimelineTab; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "cases", label: "いい事例" },
  { key: "thanks", label: "サンクス" },
  { key: "awards", label: "表彰" },
];

// 依頼10：社内SNS（いい事例の共有＋サンクス＋表彰）。ENiとイーリスの全員が見る1つのタイムライン。
export default async function SnsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; store?: string; cat?: string; ok?: string; error?: string }>;
}) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as TimelineTab;
  const [settings, stores, staff] = await Promise.all([getSnsSettings(db), db.listStores(), db.listStaff()]);
  const storeId = stores.some((s) => s.id === params.store) ? params.store : undefined;
  const category = settings.categories.includes(params.cat ?? "") ? params.cat : undefined;

  const [{ pinned, items }, unread, used] = await Promise.all([
    buildTimeline(db, { staffId: v.staffId, isAdmin: v.isAdmin }, { tab, storeId, category }),
    unreadRefIds(db, v.staffId),
    pointsUsedInMonth(db, v.staffId, thisMonthJst()),
  ]);

  const nameMap = new Map(staff.map((s) => [s.id, s.name]));
  const storeMap = new Map(stores.map((s) => [s.id, s.name]));
  const query = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { tab, store: storeId, cat: category, ...patch };
    for (const [k, val] of Object.entries(merged)) if (val && !(k === "tab" && val === "all")) q.set(k, val);
    const s = q.toString();
    return `/staff/sns${s ? `?${s}` : ""}`;
  };
  const back = query({});
  const ctx: CardContext = {
    viewerId: v.staffId,
    isAdmin: v.isAdmin,
    isExec: v.isExec,
    nameOf: (id) => (id ? (nameMap.get(id) ?? "（退職したスタッフ）") : "？"),
    storeName: (id) => (id ? (storeMap.get(id) ?? "") : ""),
    back,
    unread,
  };

  return (
    <div className="page-narrow">
      <PageHeader
        title="社内SNS"
        backHref="/staff"
        description="いい事例とサンクスを、ENiとイーリスのみんなで共有します"
        icon="heart"
        actions={
          v.isAdmin ? (
            <Link href="/staff/sns/awards" className="btn-ghost !text-xs">
              <Icon name="crown" className="w-4 h-4" />
              月間表彰
            </Link>
          ) : undefined
        }
      />
      <NotReadyNotice table={snsPosts} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />

      {/* 書く */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <Link href="/staff/sns/new" className="card !p-3.5 flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-sky-500 text-white grid place-items-center shrink-0">
            <Icon name="image" className="w-5 h-5" />
          </span>
          <span className="text-sm font-bold text-ink-900 leading-tight">いい事例を
            <br />
            投稿する
          </span>
        </Link>
        <Link href="/staff/sns/thanks/new" className="card !p-3.5 flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-rose-500 text-white grid place-items-center shrink-0">
            <Icon name="heart" className="w-5 h-5" />
          </span>
          <span className="text-sm font-bold text-ink-900 leading-tight">
            サンクスを
            <br />
            送る
          </span>
        </Link>
      </div>
      <p className="text-[11px] text-ink-500 -mt-2 mb-4">
        今月のポイント：残り <span className="font-bold text-amber-700">{Math.max(0, settings.monthlyPoints - used)}</span> / {settings.monthlyPoints}pt
        （サンクスに添えて贈れます。記録として残るだけで、お金や商品とは交換しません）
      </p>

      <TabLinks items={TABS.map((t) => ({ href: query({ tab: t.key, cat: t.key === "thanks" ? undefined : category }), label: t.label, active: tab === t.key }))} />

      {/* 絞り込み：店舗・カテゴリ */}
      <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 -mt-2 mb-4">
        <Link href={query({ store: undefined })} className={`chip shrink-0 ${!storeId ? "chip-active" : ""}`}>
          全店舗
        </Link>
        {stores.map((s) => (
          <Link key={s.id} href={query({ store: s.id })} className={`chip shrink-0 ${storeId === s.id ? "chip-active" : ""}`}>
            {s.name}
          </Link>
        ))}
      </div>
      {tab !== "thanks" && tab !== "awards" && (
        <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 -mt-2 mb-4">
          <Link href={query({ cat: undefined })} className={`chip shrink-0 ${!category ? "chip-active" : ""}`}>
            すべてのカテゴリ
          </Link>
          {settings.categories.map((c) => (
            <Link key={c} href={query({ cat: c })} className={`chip shrink-0 ${category === c ? "chip-active" : ""}`}>
              {c}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {pinned.map((item) => (
          <TimelineCard key={`pin-${item.id}`} item={item} ctx={ctx} />
        ))}
        {items.map((item) => (
          <TimelineCard key={item.id} item={item} ctx={ctx} />
        ))}
        {pinned.length + items.length === 0 && (
          <EmptyState message="まだ投稿がありません。最初の「いい事例」やサンクスを送ってみましょう" />
        )}
      </div>
    </div>
  );
}
