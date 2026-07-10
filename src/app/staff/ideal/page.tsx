import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { TimetableGrid, type TimeRow } from "@/components/timetable-grid";
import { PhotoInput } from "@/components/photo-input";
import { saveIdealWeekAction, saveMonthGoalAction } from "./actions";

const WEEKS = [
  { scope: "week1", label: "第1週" },
  { scope: "week2", label: "第2週" },
  { scope: "week3", label: "第3週" },
  { scope: "week4", label: "第4週" },
];

// 理想のスケジュール：今月の目標を先頭に表示し、第1〜4週タブで各週の理想の1日の流れを
// 予約表（タイムテーブル）風に入力。画像の貼り付けも可能。
export default async function IdealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const week = WEEKS.some((w) => w.scope === params.week) ? params.week! : "week1";

  const db = getDataStore();
  const [ideals, presets] = await Promise.all([
    db.listIdealSchedules(session.staffId),
    db.listSchedulePresets(),
  ]);
  const goal = ideals.find((s) => s.scope === "month_goal")?.content ?? "";
  const current = ideals.find((s) => s.scope === week);
  const presetLabels = presets.map((p) => p.label);

  let initialRows: TimeRow[] = [];
  try {
    const parsed = JSON.parse(current?.content || "[]");
    if (Array.isArray(parsed)) initialRows = parsed;
  } catch {
    initialRows = [];
  }

  return (
    <div>
      <PageHeader title="理想のスケジュール" backHref="/staff/morning" backLabel="今日のスケジュールへ戻る" />

      {params.saved === "goal" && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">今月の目標を保存しました</p>
      )}
      {params.saved === "week" && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">この週の理想を保存しました</p>
      )}

      {/* 今月の目標（先頭に表示） */}
      <form action={saveMonthGoalAction} className="card space-y-2 mb-4">
        <label className="label" htmlFor="content">今月の目標</label>
        <textarea
          id="content"
          name="content"
          rows={3}
          defaultValue={goal}
          placeholder="例）ワインディングとカラー塗布を安定させる。モデルを月4名。"
          className="input min-h-20"
        />
        <button type="submit" className="btn-primary w-full">今月の目標を保存</button>
      </form>

      {/* 週タブ */}
      <div className="flex gap-1.5 mb-4">
        {WEEKS.map((w) => (
          <a
            key={w.scope}
            href={`/staff/ideal?week=${w.scope}`}
            className={`flex-1 text-center text-sm font-bold rounded-full px-2 py-2 border ${
              week === w.scope ? "bg-brand-600 text-white border-brand-600" : "border-stone-300 text-stone-600"
            }`}
          >
            {w.label}
          </a>
        ))}
      </div>

      {/* 選択中の週の理想スケジュール */}
      <form action={saveIdealWeekAction} className="card space-y-3">
        <input type="hidden" name="scope" value={week} />
        <p className="font-bold text-sm text-stone-500">
          {WEEKS.find((w) => w.scope === week)?.label}の理想の1日の流れ
        </p>
        <TimetableGrid
          name="timetable_rows"
          initial={initialRows}
          presets={presetLabels}
          startHour={7}
          endHour={23}
          listId="ideal-presets"
        />
        <div>
          <p className="label !mb-2">画像を貼る（手帳・イメージ図など・任意）</p>
          <PhotoInput name="image" initial={current?.image ?? ""} label="画像を撮影・選択" />
        </div>
        <button type="submit" className="btn-primary w-full text-lg">この週の理想を保存</button>
      </form>

      <p className="text-xs text-stone-400 mt-4">
        ※ 理想のスケジュールは自分だけが編集できます。今日のスケジュール画面から見返せます。
      </p>
    </div>
  );
}
