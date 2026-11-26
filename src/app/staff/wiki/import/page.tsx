import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { canEditWiki, getWikiSettings } from "@/lib/wiki";
import { PageHeader } from "@/components/ui";
import { Note } from "@/components/feature-ui";
import { NotionImport } from "@/components/wiki/notion-import";

export const dynamic = "force-dynamic";

// Notionの書き出し（Markdown & CSV）の取り込み（編集できる人だけ）
export default async function WikiImportPage() {
  const v = await requireViewer();
  const wv = { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
  if (!(await canEditWiki(v.me, wv))) redirect("/staff/wiki");
  const settings = await getWikiSettings(getDataStore());
  return (
    <div className="page-narrow">
      <PageHeader title="Notionから取り込む" backHref="/staff/wiki" backLabel="ENi Wikipediaへ戻る" icon="notion" />
      <Note tone="info">
        Notionで、取り込みたいページの右上の「…」→「エクスポート」→ 形式「Markdown & CSV」（サブページを含める・ファイルの画像を含める）で書き出したZIPを選んでください。
        ページ（.md）とデータベース（.csv）と画像を取り込みます。同じファイルを取り込み直すと、そのページを上書きします。
        パソコンでの操作をおすすめします（iPhoneは iOS 16.4 以降）。
      </Note>
      <div className="mt-4">
        <NotionImport categories={settings.categories} canAdminOnly={v.isAdmin} />
      </div>
    </div>
  );
}
