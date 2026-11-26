import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { fx } from "@/lib/data/tables";
import { canEditWiki, canSeePage, VISIBILITY_LABEL } from "@/lib/wiki";
import { formatDateTimeJa } from "@/lib/date";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { WikiMarkdown } from "@/components/wiki/wiki-markdown";
import { deletePageAction } from "../actions";

export const dynamic = "force-dynamic";

// ENi Wikipedia の1ページ。見る権限のないページは「見つかりません」（URLを直接開いても見えない）。
export default async function WikiPageView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const v = await requireViewer();
  const { id } = await params;
  const q = await searchParams;
  const wv = { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
  const page = await fx().wikiPages.get(id);
  if (!page || !canSeePage(page, wv)) notFound();
  const [canEdit, staff] = await Promise.all([canEditWiki(v.me, wv), getDataStore().listStaff()]);
  const editor = staff.find((s) => s.id === page.updatedBy)?.name ?? "";
  return (
    <div className="page-narrow">
      <PageHeader title={page.title} backHref="/staff/wiki" backLabel="ENi Wikipediaへ戻る" />
      <Flash ok={q.ok} error={q.error} />
      <p className="text-[11px] text-ink-400 -mt-3 mb-3">
        {page.category}・{VISIBILITY_LABEL[page.visibility]}が見られる・{formatDateTimeJa(page.updatedAt)}更新{editor ? `（${editor}）` : ""}
      </p>
      <article className="card">
        {page.body.trim() ? <WikiMarkdown text={page.body} /> : <p className="text-sm text-ink-500">（まだ中身がありません）</p>}
      </article>
      {canEdit && (page.visibility !== "admin" || v.isAdmin) && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/staff/wiki/edit?id=${page.id}`} className="btn-secondary flex-1">
            編集する
          </Link>
          <Link href={`/staff/wiki/${page.id}/history`} className="btn-ghost">
            変更の履歴
          </Link>
          <form action={deletePageAction}>
            <input type="hidden" name="id" value={page.id} />
            <ConfirmSubmit className="btn-danger" message="このページを消しますか？（変更の履歴から戻せます）">
              消す
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}
