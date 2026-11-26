import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { growthTimeline } from "@/lib/growth";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { TabLinks } from "@/components/feature-ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// 依頼20：担当メンバー（同じ店舗。店舗の管理者は担当店舗。管理者は全員）の、いまの段階・次の目標・遅れの一覧。
// 1人をタップすると、その人のロードマップで項目ごとに合格の判定とコメントを入れられる。
export default async function GrowthTeamPage() {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff/growth");
  const db = getDataStore();
  const [staff, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const members = staff.filter((s) => s.isActive && s.role !== "admin" && s.id !== v.staffId && canSeeMember(v, s));
  const rows = await Promise.all(members.map(async (m) => ({ m, tl: await growthTimeline(db, m) })));
  rows.sort((a, b) => Number(b.tl.stages.some((p) => p.late)) - Number(a.tl.stages.some((p) => p.late)) || a.m.name.localeCompare(b.m.name, "ja"));
  return (
    <div className="page-narrow">
      <PageHeader title="メンバーの成長" backHref="/staff/growth" backLabel="ロードマップへ戻る" icon="users" description="目安の時期を過ぎている人を上に出しています" />
      <TabLinks
        items={[
          { href: "/staff/growth", label: "ロードマップ", active: false },
          { href: "/staff/growth/videos", label: "動画", active: false },
          { href: "/staff/growth/team", label: "メンバー", active: true },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState message="担当メンバーがいません" />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ m, tl }) => {
            const late = tl.stages.filter((p) => p.late);
            return (
              <li key={m.id}>
                <Link href={`/staff/growth?staff=${m.id}`} className="card !p-3.5 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-ink-900">
                      {m.name}
                      <span className="text-[11px] font-normal text-ink-500 ml-1.5">
                        {stores.find((s) => s.id === m.storeId)?.name ?? ""}
                        {tl.monthsSinceJoin !== null ? `・入社${tl.monthsSinceJoin}か月` : "・入社日未登録"}
                      </span>
                    </span>
                    <span className="block text-xs text-ink-600 mt-0.5 truncate">
                      いま：{tl.current?.stage.name ?? "はじめの段階"}
                      {tl.next ? ` → 次：${tl.next.stage.name}（${tl.next.passed}/${tl.next.total}）` : "（すべて達成）"}
                    </span>
                  </span>
                  {late.length > 0 ? <StatusBadge label={`遅れ ${late.length}`} tone="danger" /> : tl.next ? null : <StatusBadge label="達成" tone="ok" />}
                  <Icon name="chevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
