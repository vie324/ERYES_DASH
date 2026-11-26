import { notFound, redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { fx } from "@/lib/data/tables";
import { canEditWiki, getWikiSettings } from "@/lib/wiki";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { savePageAction } from "../actions";

export const dynamic = "force-dynamic";

// ENi Wikipedia のページを作る・直す（幹部・管理者・権限のある人）。変更のたびに履歴が残る。
export default async function WikiEditPage({ searchParams }: { searchParams: Promise<{ id?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const wv = { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
  if (!(await canEditWiki(v.me, wv))) redirect("/staff/wiki");
  const settings = await getWikiSettings(getDataStore());
  const page = params.id ? await fx().wikiPages.get(params.id) : null;
  if (params.id && (!page || page.deleted)) notFound();
  if (page?.visibility === "admin" && !v.isAdmin) redirect("/staff/wiki");
  const cats = page && !settings.categories.includes(page.category) ? [...settings.categories, page.category] : settings.categories;
  return (
    <div className="page-narrow">
      <PageHeader title={page ? "ページを直す" : "ページを作る"} backHref={page ? `/staff/wiki/${page.id}` : "/staff/wiki"} backLabel="戻る" />
      <Flash error={params.error} />
      <form action={savePageAction} className="card space-y-4">
        {page && <input type="hidden" name="id" value={page.id} />}
        <div>
          <label className="label" htmlFor="wiki-title">
            題名
          </label>
          <input id="wiki-title" name="title" required maxLength={120} defaultValue={page?.title ?? ""} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="wiki-cat">
              カテゴリ
            </label>
            <select id="wiki-cat" name="category" defaultValue={page?.category ?? cats[0]} className="input">
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="wiki-vis">
              見られる人
            </label>
            <select id="wiki-vis" name="visibility" defaultValue={page?.visibility ?? "all"} className="input">
              <option value="all">全員</option>
              <option value="exec">幹部以上</option>
              {v.isAdmin && <option value="admin">管理者だけ</option>}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="wiki-body">
            本文
          </label>
          <textarea id="wiki-body" name="body" rows={16} defaultValue={page?.body ?? ""} className="input !text-[15px] leading-relaxed font-mono" />
          <Note>
            書き方：「# 見出し」「- 箇条書き」「1. 手順」「**太字**」「[リンクの文字](https://…)」。表は「| 見出し | 見出し |」の形で書けます。
          </Note>
        </div>
        <input name="note" className="input !text-sm" placeholder="何を直したか（任意・履歴に残ります）" maxLength={100} />
        <div className="form-actions">
          <ConfirmSubmit className="btn-primary w-full" pendingLabel="保存しています…">
            保存する
          </ConfirmSubmit>
        </div>
      </form>
    </div>
  );
}
