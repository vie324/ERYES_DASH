import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { hasPermission } from "@/lib/permissions";
import { getInstagramSettings, metricLabel, summarizeAccounts } from "@/lib/instagram";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// 依頼22：幹部・管理者（と「全員のInstagramの数字を見る」の権限の人）が見る、メンバーの一覧と店舗の合計。
export default async function InstagramTeamPage() {
  const v = await requireViewer();
  const all = await hasPermission(v.session, "instagram_team");
  if (!v.isExec && !v.isStoreManager && !all) redirect("/staff/instagram");
  const db = getDataStore();
  const [staff, stores, accounts, settings] = await Promise.all([db.listStaff(), db.listStores(), fx().instagramAccounts.list(), getInstagramSettings(db)]);
  const members = staff.filter((s) => s.isActive && (all || canSeeMember(v, s)));
  const summary = await summarizeAccounts(accounts.filter((a) => members.some((m) => m.id === a.staffId)));
  const rows = members
    .map((m) => ({ m, s: summary.get(m.id) ?? null }))
    .sort((a, b) => (b.s?.latest?.followers ?? -1) - (a.s?.latest?.followers ?? -1));
  const storeTotals = stores
    .map((st) => {
      const mine = rows.filter((r) => r.m.storeId === st.id && r.s?.latest);
      return {
        store: st,
        connected: mine.length,
        followers: mine.reduce((a, r) => a + (r.s?.latest?.followers ?? 0), 0),
        change: mine.reduce((a, r) => a + (r.s?.followersChange30 ?? 0), 0),
        reach: mine.reduce((a, r) => a + (r.s?.sum30.reach ?? 0), 0),
      };
    })
    .filter((t) => t.connected > 0);
  return (
    <div className="page-narrow">
      <PageHeader title="メンバーのInstagram" backHref="/staff/instagram" backLabel="自分のInstagramへ戻る" icon="users" />
      <TabLinks
        items={[
          { href: "/staff/instagram", label: "自分", active: false },
          { href: "/staff/instagram/team", label: "メンバー", active: true },
        ]}
      />
      {storeTotals.length > 0 && (
        <section className="card !p-3.5 mb-4">
          <p className="text-[11px] font-bold text-ink-500 mb-2">店舗の合計（つないでいる人の分）</p>
          <ul className="space-y-1.5">
            {storeTotals.map((t) => (
              <li key={t.store.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{t.store.name}</span>
                <span className="tabular-nums text-xs text-ink-600">
                  {t.connected}人・フォロワー {t.followers.toLocaleString()}（{t.change >= 0 ? "+" : ""}
                  {t.change}）・{metricLabel(settings, "reach")}30日 {t.reach.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState message="メンバーがいません" />
      ) : (
        <ul className="space-y-2 mb-8">
          {rows.map(({ m, s }) => (
            <li key={m.id}>
              <Link href={`/staff/instagram?staff=${m.id}`} className="card !p-3.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-ink-900 truncate">
                    {m.name}
                    {s?.account.username && <span className="text-[11px] font-normal text-ink-500 ml-1.5">@{s.account.username}</span>}
                  </span>
                  <span className="block text-[11px] text-ink-500 tabular-nums">
                    {s?.latest
                      ? `フォロワー ${s.latest.followers.toLocaleString()}（30日 ${s.followersChange30 !== null && s.followersChange30 >= 0 ? "+" : ""}${s.followersChange30 ?? "—"}）・${metricLabel(settings, "reach")}30日 ${(s.sum30.reach ?? 0).toLocaleString()}`
                      : "まだつないでいません"}
                  </span>
                </span>
                {s?.account.status === "expired" && <StatusBadge label="つなぎ直し" tone="danger" />}
                {s?.account.status === "demo" && <StatusBadge label="デモ" tone="pending" />}
                <Icon name="chevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
