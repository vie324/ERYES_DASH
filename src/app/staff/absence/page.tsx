import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  formatDateJa,
  formatMonthJa,
  monthRange,
  thisMonthJst,
  todayJst,
} from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import type { AbsenceKind } from "@/lib/data/types";
import { cancelAbsenceReportAction, createAbsenceReportAction } from "./actions";

const KIND_LABEL: Record<AbsenceKind, string> = {
  absence: "欠勤",
  early_leave: "早退",
  late: "遅刻",
};

// 欠勤・早退の報告：誰が・いつ・何時間・どんな理由かを記録する。
// 対応するのは幹部メンバー以上なので、この画面は幹部・管理者だけが開ける
// （アシスタント・スタイリストにはメニューにも出さない）。
// 報告の取り消しは管理者アカウントだけができる。
export default async function AbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; cancelled?: string; error?: string }>;
}) {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");
  const isAdmin = session.role === "admin";

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();

  const db = getDataStore();
  const [reports, staffList] = await Promise.all([
    db.listAbsenceReports({ from, to }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  const activeStaff = staffList.filter((s) => s.isActive);
  const visible = reports;

  const kindBadge = (kind: AbsenceKind) =>
    kind === "absence" ? (
      <StatusBadge label="欠勤" tone="danger" />
    ) : kind === "early_leave" ? (
      <StatusBadge label="早退" tone="warning" />
    ) : (
      <StatusBadge label="遅刻" tone="pending" />
    );

  return (
    <div className="page-narrow">
      <PageHeader
        title="欠勤・早退の報告"
        backHref="/staff"
        description={
          isAdmin
            ? "幹部メンバー以上が記録・確認します。取り消しは管理者だけができます"
            : "幹部メンバー以上が記録・確認します"
        }
        icon="alertTriangle"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          報告を送信しました
        </p>
      )}
      {params.error === "forbidden" ? (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          報告の取り消しは管理者アカウントだけができます
        </p>
      ) : params.error ? (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください（理由は必須です）
        </p>
      ) : null}

      {/* 報告フォーム */}
      <form action={createAbsenceReportAction} className="card space-y-3 mb-4">
        <p className="section-title !mb-0">報告する</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="staff_id">
              対象スタッフ
            </label>
            <select id="staff_id" name="staff_id" className="input" defaultValue={session.staffId}>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="absence_date">
              日付
            </label>
            <input
              id="absence_date"
              name="absence_date"
              type="date"
              defaultValue={today}
              className="input"
              required
            />
          </div>
        </div>
        <div>
          <p className="label !mb-2">種類</p>
          <div className="flex gap-2">
            {(Object.keys(KIND_LABEL) as AbsenceKind[]).map((k) => (
              <label
                key={k}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  defaultChecked={k === "absence"}
                  className="h-4 w-4 accent-brand-500"
                />
                {KIND_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="hours">
            何時間（早退・遅刻のとき。欠勤は0のままでOK）
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            defaultValue={0}
            className="input text-right font-bold"
          />
        </div>
        <div>
          <label className="label" htmlFor="reason">
            理由（必須）
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={2}
            placeholder="例）体調不良（発熱）のため"
            className="input min-h-16"
            required
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full">
            この内容で報告する
          </button>
        </div>
      </form>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/absence?month=${addMonths(month, -1)}`}
        nextHref={`/staff/absence?month=${addMonths(month, 1)}`}
      />

      <section className="card">
        <h2 className="section-title">全員の報告（{formatMonthJa(month)}）</h2>
        {/* 取り消しは一覧の中で押すので、結果も一覧のすぐ上に出す（ページ上部だと見えないことがある） */}
        {params.cancelled && (
          <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-3">
            報告を取り消しました
          </p>
        )}
        {visible.length === 0 ? (
          <EmptyState message="この月の報告はありません" />
        ) : (
          <div className="space-y-2">
            {visible.map((r) => (
              <div key={r.id} className="rounded-xl border border-ink-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{formatDateJa(r.absenceDate)}</span>
                  <span className="font-bold text-sm">{staffMap.get(r.staffId) ?? "（不明）"}</span>
                  {kindBadge(r.kind)}
                  {r.hours > 0 && <span className="text-sm font-bold text-ink-600">{r.hours}時間</span>}
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  理由:{r.reason}
                  <span className="text-ink-400 ml-2">（報告:{staffMap.get(r.reportedBy) ?? "？"}）</span>
                </p>
                {/* 取り消し（管理者のみ）。誤って押さないよう、開いてからもう一度押す2段階にする */}
                {isAdmin && (
                  <details className="group mt-2 border-t border-ink-100">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center justify-end pt-2 text-xs font-bold text-red-600 [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">この報告を取り消す</span>
                      <span className="hidden text-ink-400 group-open:inline">やめる</span>
                    </summary>
                    <form
                      action={cancelAbsenceReportAction}
                      className="mt-1 flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5"
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="month" value={month} />
                      <p className="flex-1 text-xs font-bold text-red-700">
                        この{KIND_LABEL[r.kind]}の報告を取り消しますか？（元に戻せません）
                      </p>
                      <button type="submit" className="btn-danger btn-sm shrink-0">
                        取り消す
                      </button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
