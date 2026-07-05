import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { saveIdealScheduleAction } from "./actions";

// 理想のスケジュール：1週間と1ヶ月の「理想の過ごし方」を自分で決めて書いておく。
// 毎朝のスケジュール入力時に見返して、理想とのズレを確認する使い方を想定。
export default async function IdealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const ideals = await getDataStore().listIdealSchedules(session.staffId);
  const week = ideals.find((s) => s.scope === "week")?.content ?? "";
  const month = ideals.find((s) => s.scope === "month")?.content ?? "";

  return (
    <div>
      <PageHeader title="理想のスケジュール" backHref="/staff/morning" backLabel="今日のスケジュールへ戻る" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました
        </p>
      )}

      <form action={saveIdealScheduleAction} className="space-y-4">
        <div className="card">
          <label className="label" htmlFor="week_content">
            1週間の理想のスケジュール
          </label>
          <textarea
            id="week_content"
            name="week_content"
            rows={7}
            defaultValue={week}
            placeholder={"例）\n月：休み\n火〜金：営業＋閉店後練習1h\n土日：営業（モデル施術を週1回）"}
            className="input min-h-40"
          />
        </div>
        <div className="card">
          <label className="label" htmlFor="month_content">
            1ヶ月の理想のスケジュール
          </label>
          <textarea
            id="month_content"
            name="month_content"
            rows={7}
            defaultValue={month}
            placeholder={"例）\n第1週：ワインディング強化\n第2週：モデル2名\n第3週：カラーのチェックテスト\n第4週：月のふりかえり＋翌月の目標決め"}
            className="input min-h-40"
          />
        </div>
        <button type="submit" className="btn-primary w-full text-lg">
          この内容で保存する
        </button>
      </form>

      <p className="text-xs text-stone-400 mt-4">
        ※ 理想のスケジュールは自分だけが編集できます（毎朝のスケジュール画面から見返せます）。
      </p>
    </div>
  );
}
