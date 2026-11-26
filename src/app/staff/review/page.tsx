import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { DEMO_ACCOUNTS, REVIEW_ITEMS } from "@/lib/review/items";
import { PageHeader } from "@/components/ui";
import { Note } from "@/components/feature-ui";
import { ReviewBoard } from "@/components/review/review-board";

export const dynamic = "force-dynamic";

// 追加開発（依頼10〜23）を1つずつ触って確かめ、フィードバックをまとめて送るための画面（管理者・幹部・店舗の管理者）。
export default async function ReviewPage() {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff");
  const demo = isDemoMode();
  return (
    <div className="page-narrow">
      <PageHeader
        title="追加開発の確認"
        backHref={v.isAdmin ? "/admin/features" : "/staff"}
        backLabel={v.isAdmin ? "追加機能の設定へ戻る" : "ホームへ戻る"}
        icon="checkCircle"
        description="依頼ごとに、試す画面・確かめるところ・フィードバックの欄"
      />
      <Note tone={demo ? "info" : "warn"}>
        {demo
          ? "いまはデモ（見本のデータ）です。いろいろ押して試して大丈夫です（起動し直すと元に戻ります）。"
          : "いまは本番のデータにつながっています。試しの投稿・申請は、あとで消してください。"}
        書いたフィードバックはこの端末にだけ残ります。「まとめてコピー」で文にして、開発の担当に送ってください。
      </Note>
      {demo && (
        <details className="card !p-3.5 my-4">
          <summary className="cursor-pointer text-sm font-bold">デモのアカウント</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-700">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.id}>
                <code className="font-bold text-brand-700">{a.id}</code>　{a.who}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-500 mt-2">ログインのあと、ENi（ヘアサロン）とイーリスのどちらで開くかを選びます。ENiの機能は ENi を選んでください。</p>
        </details>
      )}
      <div className="mt-4 mb-10">
        <ReviewBoard items={REVIEW_ITEMS} reviewer={v.me?.name ?? ""} />
      </div>
    </div>
  );
}
