import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { formatDateTimeJa } from "@/lib/date";
import { pendingApprovals } from "@/lib/approvals";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash } from "@/components/feature-ui";
import { decideApprovalAction } from "./actions";

export const dynamic = "force-dynamic";

// 承認のお願い（店長・副店長・店舗の管理者・管理者）。届いた申請をここで決める。
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff");
  const params = await searchParams;
  const db = getDataStore();
  const [items, staff] = await Promise.all([pendingApprovals(db, v.me), db.listStaff()]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="page-narrow">
      <PageHeader title="承認のお願い" backHref="/staff" icon="checkCircle" description="締切後の希望休・打刻の修正・締め日後の入力の救済" />
      <Flash ok={params.ok} error={params.error} />
      {items.length === 0 ? (
        <EmptyState message="いま決めることはありません" />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="card space-y-2">
              <p className="text-sm font-bold text-ink-900">{nameOf(it.staffId)}さん</p>
              <p className="text-sm text-ink-800">{it.title}</p>
              {it.detail && <p className="text-xs text-ink-500 whitespace-pre-wrap">理由：{it.detail}</p>}
              <p className="text-[11px] text-ink-400">{formatDateTimeJa(it.createdAt)}</p>
              <form action={decideApprovalAction} className="space-y-2">
                <input type="hidden" name="kind" value={it.kind} />
                <input type="hidden" name="id" value={it.id} />
                <input name="note" className="input !min-h-10 !py-1.5 !text-sm" placeholder="ひとこと（任意。本人に届きます）" maxLength={200} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" name="decision" value="approved" className="btn-primary !min-h-11 !text-sm">
                    承認する
                  </button>
                  <button type="submit" name="decision" value="rejected" className="btn-secondary !min-h-11 !text-sm">
                    見送る
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
