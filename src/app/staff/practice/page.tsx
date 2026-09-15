import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  datesOfMonth,
  formatMonthJa,
  monthRange,
  thisMonthJst,
  todayJst,
  weekdayJa,
  weekdayOf,
} from "@/lib/date";
import { formatPracticeMinutes, isExecutive } from "@/lib/eni/access";
import { MonthNav, PageHeader } from "@/components/ui";
import { addPracticeRecordAction, deletePracticeRecordAction } from "./actions";

// 練習記録（月間活動記録表のシステム化）：
// 表＝日付×メンバーで練習時間と相手が見える。自分の練習を下のフォームから記録する。
// 月の合計時間が自動で集計される。
// ※ 月ごとの「練習ペア」の割り当ては廃止した（運用で使われなかったため）。
//    誰にどれだけ見てもらえているかは、週報の「先輩の指導状況」で見る。
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();
  const isExec = await isExecutive(session);

  const db = getDataStore();
  const [staffList, records] = await Promise.all([
    db.listStaff(),
    db.listPracticeRecords({ from, to }),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  // 表の列＝ENiのメンバー（職種が設定されているスタッフ）。アシスタントを先に並べる
  const members = staffList
    .filter((s) => s.isActive && s.jobType !== "")
    .sort((a, b) => (a.jobType === b.jobType ? 0 : a.jobType === "assistant" ? -1 : 1));
  const partnerCandidates = staffList.filter((s) => s.isActive);

  const dates = datesOfMonth(month);
  const totals = new Map<string, number>();
  for (const r of records) {
    totals.set(r.staffId, (totals.get(r.staffId) ?? 0) + r.minutes);
  }

  const savedMsg =
    params.saved === "record"
      ? "練習を記録しました"
      : params.saved === "deleted"
        ? "記録を削除しました"
        : params.saved === "pair"
          ? "ペアを保存しました"
          : "";

  const partnerLabel = (r: { partnerStaffId: string | null; partnerName: string }) =>
    r.partnerStaffId ? (staffMap.get(r.partnerStaffId)?.name ?? "？") : r.partnerName;

  return (
    <div>
      <PageHeader title="練習記録" backHref="/staff" />

      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {savedMsg}
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* 自分の練習を記録 */}
      <form action={addPracticeRecordAction} className="card space-y-3 mb-4">
        <p className="section-title !mb-0">練習を記録する</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="practice_date">
              日付
            </label>
            <input
              id="practice_date"
              name="practice_date"
              type="date"
              defaultValue={today}
              max={today}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="minutes">
              時間（分）
            </label>
            <input
              id="minutes"
              name="minutes"
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              placeholder="60"
              className="input text-right font-bold"
              required
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="partner_staff_id">
            見てくれた人（スタッフ）
          </label>
          <select
            id="partner_staff_id"
            name="partner_staff_id"
            className="input"
          >
            <option value="">スタッフ以外（下に記入）／ひとりで練習</option>
            {partnerCandidates
              .filter((s) => s.id !== session.staffId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="partner_name">
              スタッフ以外の相手（任意）
            </label>
            <input
              id="partner_name"
              name="partner_name"
              type="text"
              placeholder="例）モデル 花田さん"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="content">
              練習内容（任意）
            </label>
            <input
              id="content"
              name="content"
              type="text"
              placeholder="例）ワインディング"
              className="input"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">
          この内容で記録する
        </button>
      </form>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/practice?month=${addMonths(month, -1)}`}
        nextHref={`/staff/practice?month=${addMonths(month, 1)}`}
      />

      {/* 月間活動記録表 */}
      <section className="card">
        <h2 className="section-title">
          月間活動記録（デビューまでフルスピード）
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-ink-400">
            職種（スタイリスト／アシスタント）が設定されたスタッフがいません（マスタ設定から設定できます）
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>日付</th>
                  {members.map((m) => (
                    <th key={m.id} className={m.id === session.staffId ? "!text-brand-700" : ""}>
                      {m.name.split(" ")[0]}
                      {m.jobType === "stylist" && (
                        <span className="block text-[9px] font-normal text-ink-400">スタイリスト</span>
                      )}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="!text-brand-700">合計</th>
                  {members.map((m) => (
                    <th key={m.id} className="!text-brand-700">
                      {totals.get(m.id) ? formatPracticeMinutes(totals.get(m.id)!) : "−"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const wd = weekdayOf(date);
                  const dayRecords = records.filter((r) => r.practiceDate === date);
                  if (date > today && dayRecords.length === 0) return null; // 未来の空行は出さない
                  return (
                    <tr key={date} className={date === today ? "bg-brand-50/70" : ""}>
                      <td
                        className={`font-bold whitespace-nowrap ${
                          wd === 0 ? "text-red-500" : wd === 6 ? "text-blue-500" : ""
                        }`}
                      >
                        {date.slice(8)}({weekdayJa(wd)})
                      </td>
                      {members.map((m) => {
                        const mine = dayRecords.filter((r) => r.staffId === m.id);
                        return (
                          <td key={m.id} className="text-xs whitespace-nowrap align-top">
                            {mine.map((r) => (
                              <span key={r.id} className="block">
                                <span className="font-bold">{formatPracticeMinutes(r.minutes)}</span>
                                {partnerLabel(r) && (
                                  <span className="text-ink-400 text-[10px]">
                                    （{partnerLabel(r)}）
                                  </span>
                                )}
                                {(r.staffId === session.staffId || isExec) && (
                                  <DeleteRecordButton id={r.id} month={month} />
                                )}
                              </span>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-400 mt-2">
          （ ）内は見てくれた人・モデルさん ／ ×で自分の記録を削除できます
        </p>
      </section>

    </div>
  );
}

/** 記録の削除ボタン（フォーム1つ＝×印） */
function DeleteRecordButton({ id, month }: { id: string; month: string }) {
  return (
    <form action={deletePracticeRecordAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        aria-label="この記録を削除"
        className="text-ink-300 hover:text-red-500 text-[10px] font-bold px-1"
      >
        ×
      </button>
    </form>
  );
}
