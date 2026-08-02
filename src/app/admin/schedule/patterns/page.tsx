import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { weekdayJa } from "@/lib/date";
import { PageHeader } from "@/components/ui";
import { saveWorkPatternAction } from "../actions";

// 週の基本パターン設定（管理者用）：スタッフごとに曜日別の出勤・時間を設定する。
// 例）さくら＝火〜日フル出勤（月曜定休）／あずみ＝火〜金 10:00-16:30（金曜のみ12:00-16:30）
export default async function WorkPatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const [staffList, patterns] = await Promise.all([db.listStaff(), db.listWorkPatterns()]);
  const activeStaff = staffList.filter((s) => s.isActive);

  return (
    <div className="page-narrow">
      <PageHeader
        title="基本パターンの設定"
        backHref="/admin/schedule"
        backLabel="スケジュールへ戻る"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          基本パターンを保存しました
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      <p className="text-xs text-ink-500 mb-4">
        曜日ごとの出勤と時間を設定すると、毎月のスケジュールが自動で組まれます（希望休・個別調整はこの上に反映）。
        定休日は全員「休み」にしてください。
      </p>

      <div className="space-y-4">
        {activeStaff.map((s) => {
          const mine = patterns.filter((p) => p.staffId === s.id);
          return (
            <form key={s.id} action={saveWorkPatternAction} className="card space-y-3">
              <input type="hidden" name="staff_id" value={s.id} />
              <p className="font-bold">{s.name}</p>

              <div className="space-y-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
                  const day = mine.find((p) => p.weekday === wd);
                  return (
                    <div key={wd} className="flex items-center gap-2">
                      <span
                        className={`w-8 shrink-0 text-sm font-bold ${
                          wd === 0 ? "text-red-500" : wd === 6 ? "text-blue-500" : "text-ink-600"
                        }`}
                      >
                        {weekdayJa(wd)}
                      </span>
                      <label className="flex items-center gap-1.5 text-sm font-bold w-20 shrink-0">
                        <input
                          type="checkbox"
                          name={`wd_${wd}_working`}
                          defaultChecked={day?.isWorking ?? false}
                          className="h-5 w-5 accent-brand-500"
                        />
                        出勤
                      </label>
                      <input
                        type="time"
                        name={`wd_${wd}_start`}
                        defaultValue={day?.startTime ?? ""}
                        className="input !min-h-10 !py-1.5 text-sm flex-1"
                        aria-label={`${weekdayJa(wd)}曜の開始時間`}
                      />
                      <span className="text-ink-400">〜</span>
                      <input
                        type="time"
                        name={`wd_${wd}_end`}
                        defaultValue={day?.endTime ?? ""}
                        className="input !min-h-10 !py-1.5 text-sm flex-1"
                        aria-label={`${weekdayJa(wd)}曜の終了時間`}
                      />
                    </div>
                  );
                })}
              </div>

              <button type="submit" className="btn-primary w-full">
                {s.name}さんのパターンを保存
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
