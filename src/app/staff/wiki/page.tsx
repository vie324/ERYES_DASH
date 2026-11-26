import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { canEditWiki, getWikiSettings, listVisiblePages, searchWiki, VISIBILITY_LABEL } from "@/lib/wiki";
import { wikiPages } from "@/lib/data/tables";
import { formatDateJa, toJstDateString } from "@/lib/date";
import { PageHeader, EmptyState } from "@/components/ui";
import { Flash, NotReadyNotice } from "@/components/feature-ui";
import { Icon } from "@/components/icons";
import { WikiAskBox } from "@/components/wiki/ask-box";
import { accentStyle } from "@/lib/menu-accent";

export const dynamic = "force-dynamic";

// 依頼11（68）：ENi Wikipedia（マニュアル・ルール）。見る権限のないページは、一覧・検索・AIの根拠に出さない。
export default async function WikiPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const wv = { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
  const [settings, pages, canEdit] = await Promise.all([getWikiSettings(db), listVisiblePages(wv), canEditWiki(v.me, wv)]);
  const q = (params.q ?? "").trim().slice(0, 100);
  const hits = q ? await searchWiki(q, wv, 30) : [];
  const cat = settings.categories.includes(params.cat ?? "") ? params.cat : undefined;
  const shown = pages.filter((p) => !cat || p.category === cat);
  const cats = [...settings.categories, ...[...new Set(pages.map((p) => p.category))].filter((c) => !settings.categories.includes(c))];

  return (
    <div className="page-narrow">
      <PageHeader
        title="ENi Wikipedia"
        backHref="/staff"
        description="マニュアル・ルールの置き場所。わからないことはAIに聞けます"
        icon="book"
        actions={
          canEdit ? (
            <Link href="/staff/wiki/edit" className="btn-ghost !text-xs">
              <Icon name="plus" className="w-4 h-4" />
              ページを作る
            </Link>
          ) : undefined
        }
      />
      <NotReadyNotice table={wikiPages} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      <WikiAskBox />

      <form action="/staff/wiki" className="flex gap-2 mt-4">
        <input name="q" defaultValue={q} className="input flex-1 !min-h-11" placeholder="ことばで探す（全文検索）" />
        <button type="submit" className="btn-secondary !min-h-11 !px-4 !text-sm">
          <Icon name="search" className="w-4 h-4" />
          探す
        </button>
      </form>

      {q ? (
        <section className="mt-4">
          <h2 className="section-title">「{q}」の検索結果（{hits.length}件）</h2>
          {hits.length === 0 ? (
            <EmptyState message="見つかりませんでした。ことばを変えるか、上のAIに聞いてみてください" />
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.page.id}>
                  <Link href={`/staff/wiki/${h.page.id}`} className="card !p-3.5 block">
                    <span className="block text-sm font-bold text-ink-900">{h.page.title}</span>
                    <span className="block text-[11px] text-ink-400">{h.page.category}</span>
                    <span className="block text-xs text-ink-600 mt-1 line-clamp-2">{h.excerpt}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mt-4 mb-3">
            <Link href="/staff/wiki" className={`chip shrink-0 ${!cat ? "chip-active" : ""}`}>
              すべて<span className="opacity-70">{pages.length}</span>
            </Link>
            {cats.map((c) => (
              <Link key={c} href={`/staff/wiki?cat=${encodeURIComponent(c)}`} className={`chip shrink-0 ${cat === c ? "chip-active" : ""}`}>
                {c}
                <span className="opacity-70">{pages.filter((p) => p.category === c).length}</span>
              </Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState
              message={canEdit ? "まだページがありません。「ページを作る」か、Notionから取り込んでください" : "まだページがありません"}
              action={
                canEdit ? (
                  <Link href="/staff/wiki/import" className="btn-secondary">
                    Notionから取り込む
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="ios-list border border-brand-100">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link href={`/staff/wiki/${p.id}`} className="ios-row">
                    <span className="ios-row-icon" style={accentStyle("gold")}>
                      <Icon name="book" className="w-[17px] h-[17px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold truncate">{p.title}</span>
                      <span className="block text-[12px] ios-secondary truncate">
                        {p.category}・{formatDateJa(toJstDateString(p.updatedAt))}更新
                        {p.visibility !== "all" && `・${VISIBILITY_LABEL[p.visibility]}`}
                      </span>
                    </span>
                    <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-[#c7c7cc]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <p className="text-center mt-4">
              <Link href="/staff/wiki/import" className="text-sm font-bold text-brand-700 underline">
                Notionの書き出しから取り込む
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
