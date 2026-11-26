import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { getSnsSettings } from "@/lib/sns";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { MultiPhotoInput } from "@/components/sns/photo-parts";
import { createPostAction } from "../actions";

export const dynamic = "force-dynamic";

// いい事例の投稿（写真と文章）。お客様の顔や個人情報を載せないよう、注意書きを常に出す。
export default async function NewSnsPostPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const settings = await getSnsSettings(getDataStore());
  return (
    <div className="page-narrow">
      <PageHeader title="いい事例を投稿" backHref="/staff/sns" backLabel="社内SNSへ戻る" />
      <Flash error={params.error} />
      <form action={createPostAction} className="card space-y-4">
        <Note tone="warn">⚠️ {settings.postNotice}</Note>
        <div>
          <p className="label">カテゴリ</p>
          <div className="flex flex-wrap gap-2">
            {settings.categories.map((c, i) => (
              <label key={c}>
                <input type="radio" name="category" value={c} defaultChecked={i === 0} className="peer sr-only" />
                <span className="chip cursor-pointer">{c}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sns-body">
            どんな「いい事例」でしたか
          </label>
          <textarea
            id="sns-body"
            name="body"
            rows={5}
            maxLength={3000}
            className="input min-h-32"
            placeholder="例）ご新規のお客様に、仕上げの前にスタイリングの仕方を一緒に練習したら、とても喜んでくださいました"
          />
        </div>
        <div>
          <p className="label">写真（4枚まで）</p>
          <MultiPhotoInput name="photos" />
        </div>
        {v.isExec && (
          <label className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-sm">
            <input type="checkbox" name="announce" className="mt-1 w-4 h-4" />
            <span>
              <span className="font-bold text-ink-900">お知らせとして全員に届ける</span>
              <span className="block text-xs text-ink-500 mt-0.5">開いて見るまで、全員のホームとアイコンの赤い数字に残ります（幹部・管理者だけ）</span>
            </span>
          </label>
        )}
        <div className="form-actions">
          <ConfirmSubmit className="btn-primary w-full" pendingLabel="投稿しています…">
            投稿する
          </ConfirmSubmit>
        </div>
      </form>
    </div>
  );
}
