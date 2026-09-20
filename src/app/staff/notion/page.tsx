import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getNotionLinks } from "@/lib/settings";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// ノーションの入口。スマホ下部タブの「ノーション」から開く。
// 接続先（ENiについて／マニュアルまとめ）の定義は lib/notion.ts、URLは管理者がマスタ設定で変更できる。
// ノーション側はログインが要るので、アプリの中には埋め込まず新しいタブで開く。
export default async function NotionPage() {
  await requireSession();
  const links = await getNotionLinks(getDataStore());

  return (
    <div className="page-narrow">
      <PageHeader
        title="ノーション"
        description="考え方・ルール・マニュアルはすべてノーションにまとまっています"
        backHref="/staff"
        icon="notion"
      />

      {links.length === 0 ? (
        <EmptyState message="接続先がまだ設定されていません（管理者のマスタ設定から登録できます）" />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="card group flex items-center gap-3.5 min-h-[5.25rem] relative overflow-hidden"
            >
              <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand-400 to-brand-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="w-12 h-12 flex items-center justify-center rounded-2xl shrink-0 bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 text-brand-700 transition-colors duration-300 group-hover:from-brand-100 group-hover:to-brand-200 group-hover:border-brand-300">
                <Icon name="notion" className="w-6 h-6" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold text-ink-900 leading-snug">
                  {link.label}
                  <span className="text-brand-400 text-xs font-bold ml-1.5" aria-hidden="true">
                    ↗
                  </span>
                </span>
                <span className="block text-xs text-ink-500 mt-1 leading-relaxed text-pretty">
                  {link.summary}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-400 mt-4 leading-relaxed">
        ノーションは新しいタブで開きます。初めて開くときはノーションへのログインが必要です。
      </p>
    </div>
  );
}
