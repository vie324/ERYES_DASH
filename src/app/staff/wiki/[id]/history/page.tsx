import { notFound, redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { fx } from "@/lib/data/tables";
import { canEditWiki } from "@/lib/wiki";
import { formatDateTimeJa } from "@/lib/date";
import { PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { restorePageAction } from "../../actions";

export const dynamic = "force-dynamic";

// ページの変更の履歴（編集できる人だけ）。どの版にも戻せる。
export default async function WikiHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const wv = { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
  if (!(await canEditWiki(v.me, wv))) redirect("/staff/wiki");
  const page = await fx().wikiPages.get(id);
  if (!page || (page.visibility === "admin" && !v.isAdmin)) notFound();
  const [revs, staff] = await Promise.all([
    fx().wikiRevisions.list({ where: { pageId: id }, order: [["createdAt", "desc"]], limit: 50 }),
    getDataStore().listStaff(),
  ]);
  const nameOf = (sid: string | null) => staff.find((s) => s.id === sid)?.name ?? "";
  return (
    <div className="page-narrow">
      <PageHeader title="変更の履歴" backHref={`/staff/wiki/${id}`} backLabel="ページへ戻る" description={page.title} />
      <ul className="space-y-2">
        {revs.map((r, i) => (
          <li key={r.id} className="card !p-3.5">
            <p className="text-xs font-bold text-ink-600">
              {formatDateTimeJa(r.createdAt)}・{r.note || "編集"}・{nameOf(r.editedBy)}
              {i === 0 && <span className="ml-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px]">いまの版</span>}
            </p>
            <p className="text-sm font-bold text-ink-900 mt-1">{r.title}</p>
            <p className="text-xs text-ink-600 line-clamp-3 whitespace-pre-wrap">{r.body}</p>
            {i > 0 && (
              <form action={restorePageAction} className="text-right mt-1">
                <input type="hidden" name="revision" value={r.id} />
                <ConfirmSubmit className="btn-ghost !text-xs" message="この版に戻しますか？（いまの版も履歴に残ります）">
                  この版に戻す
                </ConfirmSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
