import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  datesOfMonth,
  formatDateJa,
  formatMonthJa,
  weekdayJa,
  weekdayOf,
} from "@/lib/date";
import { ASSISTANT_MARGIN, computeBoardWarnings } from "@/lib/shift/assign";
import { buildShiftMonthInputs, meetingNamesOn } from "@/lib/shift/context";
import { SHIFT_TYPE_LABEL } from "@/lib/shift/labels";
import { currentTargetMonth } from "@/lib/shift/period";
import { MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  addAssignmentAction,
  confirmMonthAction,
  deleteAssignmentAction,
  runAutoAssignAction,
} from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  confirmed: "確定済みの月は自動割当をやり直せません（手動調整は可能です）",
  duplicate: "そのスタッフはその日すでに割り当てられています",
  input: "入力内容を確認してください",
  confirm_check: "確定するには確認チェックを入れてください",
  empty: "割当が1件もないため確定できません。先に自動割当を実行してください",
};

// 割当ボード：自動割当（下書き）→ 手動調整 → 確定（公開）までを1画面で行う
export default async function AdminShiftBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    date?: string;
    store?: string;
    generated?: string;
    shortage?: string;
    saved?: string;
    deleted?: string;
    confirmed?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const rules = await db.getShiftRules();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentTargetMonth(rules);

  const [assignments, inputs, requests, committees] = await Promise.all([
    db.listShiftAssignments(month),
    // 希望・段数・ランク・会議の参加者など（自動割当と同じ前提で警告を出す）
    buildShiftMonthInputs(db, month),
    db.listShiftRequests(month),
    db.listCommittees(),
  ]);
  const { stores, staffList } = inputs;
  const committeeNames = new Map(committees.map((c) => [c.committeeKey, c.name]));
  // 休み希望の理由・有休（重なったときの判断材料としてボードにも出す）
  const offDetail = new Map(
    requests.filter((r) => r.preference === "off").map((r) => [`${r.date}|${r.staffId}`, r])
  );

  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const activeStaff = staffList.filter((s) => s.isActive);
  const isConfirmed = assignments.some((a) => a.status === "confirmed");
  const status = assignments.length === 0 ? "未作成" : isConfirmed ? "確定済み" : "下書き";

  // 警告計算（自動・手動を問わず現状の割当全体を検査）
  const warnings = computeBoardWarnings(month, assignments, inputs);
  const surplusByDate = new Map(warnings.surplus.map((s) => [s.date, s.staffIds]));
  const hasWarnings =
    warnings.coverage.length > 0 ||
    warnings.offConflicts.length > 0 ||
    warnings.storeConflicts.length > 0 ||
    warnings.consecutive.length > 0 ||
    warnings.stylistOffOverlap.length > 0 ||
    warnings.noStylist.length > 0 ||
    warnings.meetingAbsent.length > 0;
  const coverageSet = new Set(warnings.coverage.map((w) => `${w.date}|${w.storeId}`));
  const offConflictSet = new Set(warnings.offConflicts.map((w) => `${w.date}|${w.staffId}`));
  const storeConflictSet = new Set(
    warnings.storeConflicts.map((w) => `${w.date}|${w.staffId}|${w.storeId}`)
  );

  const byDateStore = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = `${a.date}|${a.storeId}`;
    if (!byDateStore.has(key)) byDateStore.set(key, []);
    byDateStore.get(key)!.push(a);
  }

  const shortName = (name: string) => name.split(/\s+/)[0]; // 表は姓のみでコンパクトに

  return (
    <div>
      <PageHeader
        title={`割当ボード（${formatMonthJa(month)}分）`}
        backHref={`/admin/shift?month=${month}`}
        backLabel="シフト管理へ戻る"
      />
      <MonthNav
        month={month}
        monthLabel={`${formatMonthJa(month)}分`}
        prevHref={`/admin/shift/board?month=${addMonths(month, -1)}`}
        nextHref={`/admin/shift/board?month=${addMonths(month, 1)}`}
      />

      {params.generated && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-3">
          自動割当で{params.generated}件の下書きを作成しました
          {Number(params.shortage) > 0 && `（人数不足 ${params.shortage}枠 → 下の警告を確認）`}
        </p>
      )}
      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-3">
          割当を追加しました
        </p>
      )}
      {params.deleted && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-3">
          割当を削除しました
        </p>
      )}
      {params.confirmed && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-3">
          シフトを確定しました（{params.confirmed}件）。全スタッフが閲覧できます。
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-3">
          {ERROR_MESSAGES[params.error] ?? "操作に失敗しました"}
        </p>
      )}

      <div className="card mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink-500">状態：</span>
          {status === "確定済み" ? (
            <StatusBadge label="確定済み（公開中）" tone="ok" />
          ) : status === "下書き" ? (
            <StatusBadge label="下書き（スタッフには非公開）" tone="warning" />
          ) : (
            <StatusBadge label="未作成" tone="muted" />
          )}
        </div>

        {!isConfirmed && (
          <form action={runAutoAssignAction}>
            <input type="hidden" name="target_month" value={month} />
            <button type="submit" className="btn-secondary w-full">
              自動割当を実行（下書きを作り直す）
            </button>
            <div className="text-xs text-ink-400 mt-1.5 space-y-1">
              <p>
                ※ 希望（休み・店舗・早遅）と連勤上限{rules.maxConsecutiveDays}日・各店舗
                {rules.minStaffPerStoreDay}名を守ったうえで、次の考え方で組み立てます。
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>スタイリストの休みを先に決める（希望休を優先。平日の調整休みはスタイリスト同士で別の日に。3段同士は必ず別）</li>
                <li>各店舗にスタイリストを均等に配置し、アシスタントは「スタイリストの段数の合計 〜 ＋{ASSISTANT_MARGIN}人」を目安に入れる</li>
                <li>それ以上に人が余る日は「有休候補」として下に出す</li>
                <li>しもん塾・全体会議など全員参加の日は、出られる人を全員出勤にする</li>
                <li>幹部会議など会議のある日は、参加者を休みにしない</li>
                <li>土日はなるべく出勤。休みになる場合は段数の少ない人（1段）から。平日は土日が連勤上限に当たらないよう調整する</li>
                <li>段数の多いスタイリストが休む日は、年数の高いアシスタント（ファイナル・ミドル）も休みに寄せる</li>
              </ul>
              <p>下書きなので、気になるところは下の表から手で入れ替えてください。</p>
              <p>実行すると現在の下書き・手動調整は消えます。</p>
            </div>
          </form>
        )}

        {!isConfirmed && assignments.length > 0 && (
          <form action={confirmMonthAction} className="border-t border-ink-100 pt-3 space-y-2">
            <input type="hidden" name="target_month" value={month} />
            <label className="flex items-start gap-2 text-sm font-bold text-ink-600">
              <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 accent-brand-500" />
              内容を確認しました。確定すると全スタッフに公開されます。
            </label>
            <button type="submit" className="btn-primary w-full">この月のシフトを確定する</button>
          </form>
        )}
        {isConfirmed && (
          <p className="text-xs text-ink-500">
            確定済みです。下の表から削除・追加した変更は即時公開されます。
          </p>
        )}
      </div>

      {hasWarnings && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 mb-4 text-sm space-y-1.5">
          <p className="font-bold text-red-700 flex items-center gap-1.5"><Icon name="alertTriangle" className="w-4 h-4" />警告（手動調整で解消してください）</p>
          {warnings.coverage.length > 0 && (
            <p className="text-red-600">
              ・人数不足（{rules.minStaffPerStoreDay}名未満）：{warnings.coverage.length}枠
              （表の赤いマスです）
            </p>
          )}
          {warnings.offConflicts.map((w) => {
            const detail = offDetail.get(`${w.date}|${w.staffId}`);
            return (
              <p key={`off-${w.date}-${w.staffId}`} className="text-red-600">
                ・{formatDateJa(w.date)}：{staffMap.get(w.staffId)?.name}さんの休み希望日
                {detail?.paidLeave && "（有休）"}に割当があります
                {detail?.reason && <span className="text-red-500">（理由：{detail.reason}）</span>}
              </p>
            );
          })}
          {warnings.stylistOffOverlap.map((w) => (
            <p key={`so-${w.date}`} className={w.top ? "text-red-600 font-bold" : "text-amber-700"}>
              ・{formatDateJa(w.date)}：スタイリストの休みが重なっています（
              {w.staffIds.map((id) => staffMap.get(id)?.name.split(/\s+/)[0] ?? "？").join("・")}）
              {w.top ? "※ 3段のスタイリスト同士は必ず別の日にしてください" : ""}
            </p>
          ))}
          {warnings.noStylist.map((w) => (
            <p key={`ns-${w.date}-${w.storeId}`} className="text-amber-700">
              ・{formatDateJa(w.date)}：{stores.find((s) => s.id === w.storeId)?.name.replace(/^EREYS\s*/, "")}
              にスタイリストがいません
            </p>
          ))}
          {warnings.meetingAbsent.map((w) => (
            <p key={`ma-${w.date}-${w.staffId}`} className="text-amber-700">
              ・{formatDateJa(w.date)}：{staffMap.get(w.staffId)?.name}さんは
              {meetingNamesOn(inputs.meetings, w.date, committeeNames) || "会議"}の参加者ですが休みです
            </p>
          ))}
          {warnings.storeConflicts.map((w) => (
            <p key={`store-${w.date}-${w.staffId}`} className="text-amber-700">
              ・{formatDateJa(w.date)}：{staffMap.get(w.staffId)?.name}さんは勤務可能店舗外（または希望未提出）です
            </p>
          ))}
          {warnings.consecutive.map((w) => (
            <p key={`run-${w.staffId}-${w.from}`} className="text-red-600">
              ・{staffMap.get(w.staffId)?.name}さんが{formatDateJa(w.from)}〜{formatDateJa(w.to)}で
              {w.length}連勤（上限{rules.maxConsecutiveDays}日）
            </p>
          ))}
        </div>
      )}

      {warnings.surplus.length > 0 && (
        <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 mb-4 text-sm space-y-1">
          <p className="font-bold text-sky-800">人が余っている日（有休を使ってもらう候補）</p>
          <p className="text-xs text-sky-700">
            各店舗のアシスタントが「スタイリストの段数の合計＋{ASSISTANT_MARGIN}人」に達しているのに、
            まだ出られる人がいる日です。有休の消化に充ててもらう相談の目安にしてください。
          </p>
          {warnings.surplus.map((s) => (
            <p key={`sp-${s.date}`} className="text-sky-800">
              ・{formatDateJa(s.date)}：
              {s.staffIds.map((id) => staffMap.get(id)?.name.split(/\s+/)[0] ?? "？").join("・")}
            </p>
          ))}
        </div>
      )}

      <div className="card !p-2 overflow-x-auto mb-4">
        <table className="table-base">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10">日付</th>
              {stores.map((s) => (
                <th key={s.id} className="min-w-28">{s.name.replace(/^EREYS\s*/, "")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datesOfMonth(month).map((date) => {
              const wd = weekdayOf(date);
              return (
                <tr key={date} className={wd === 0 || wd === 6 ? "bg-ink-50" : ""}>
                  <td
                    className={`sticky left-0 bg-inherit font-bold whitespace-nowrap z-10 ${
                      wd === 0 ? "text-red-400" : wd === 6 ? "text-sky-500" : ""
                    }`}
                  >
                    {Number(date.slice(8))}({weekdayJa(wd)})
                    {surplusByDate.has(date) && (
                      <span className="block text-[10px] font-bold text-sky-600">余り{surplusByDate.get(date)!.length}名</span>
                    )}
                  </td>
                  {stores.map((store) => {
                    const key = `${date}|${store.id}`;
                    const cell = byDateStore.get(key) ?? [];
                    const understaffed = coverageSet.has(key);
                    return (
                      <td
                        key={store.id}
                        className={`align-top ${understaffed ? "!bg-red-50" : ""}`}
                      >
                        <div className="flex flex-col gap-1">
                          {cell.map((a) => {
                            const off = offConflictSet.has(`${date}|${a.staffId}`);
                            const offInfo = offDetail.get(`${date}|${a.staffId}`);
                            const outside = storeConflictSet.has(`${date}|${a.staffId}|${store.id}`);
                            return (
                              <span
                                key={a.id}
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap ${
                                  off
                                    ? "border-red-400 bg-red-100 text-red-700"
                                    : outside
                                      ? "border-amber-400 bg-amber-50 text-amber-800"
                                      : "border-ink-200 bg-white text-ink-700"
                                }`}
                                title={
                                  off && offInfo
                                    ? `${staffMap.get(a.staffId)?.name}：休み希望${offInfo.paidLeave ? "（有休）" : ""}${offInfo.reason ? `・${offInfo.reason}` : ""}`
                                    : staffMap.get(a.staffId)?.name
                                }
                              >
                                <span className="font-bold">
                                  {shortName(staffMap.get(a.staffId)?.name ?? "？")}
                                </span>
                                <span className="text-ink-400">
                                  {SHIFT_TYPE_LABEL[a.shiftType]}
                                </span>
                                {off && <span>{offInfo?.paidLeave ? "有休!" : "休!"}</span>}
                                <form action={deleteAssignmentAction} className="inline">
                                  <input type="hidden" name="id" value={a.id} />
                                  <input type="hidden" name="target_month" value={month} />
                                  <button
                                    type="submit"
                                    aria-label="この割当を削除"
                                    className="text-ink-400 hover:text-red-500 font-bold px-0.5"
                                  >
                                    ×
                                  </button>
                                </form>
                              </span>
                            );
                          })}
                          <span
                            className={`text-[10px] font-bold ${understaffed ? "text-red-600" : "text-ink-400"}`}
                          >
                            {cell.length}/{rules.minStaffPerStoreDay}名
                            <Link
                              href={`/admin/shift/board?month=${month}&date=${date}&store=${store.id}#add-form`}
                              className="ml-1 text-brand-600 underline"
                            >
                              ＋追加
                            </Link>
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section id="add-form" className="card">
        <h2 className="section-title">割当を追加（手動調整）</h2>
        <form action={addAssignmentAction} className="space-y-3">
          <input type="hidden" name="target_month" value={month} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="add_date">日付</label>
              <input
                id="add_date"
                name="date"
                type="date"
                className="input"
                defaultValue={params.date?.startsWith(month) ? params.date : `${month}-01`}
                min={`${month}-01`}
                max={datesOfMonth(month).at(-1)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="add_type">早番／遅番</label>
              <select id="add_type" name="shift_type" className="input" defaultValue="early">
                <option value="early">早番</option>
                <option value="late">遅番</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="add_staff">スタッフ</label>
            <select id="add_staff" name="staff_id" className="input" required defaultValue="">
              <option value="" disabled>選択してください</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="add_store">店舗</label>
            <select
              id="add_store"
              name="store_id"
              className="input"
              required
              defaultValue={params.store && stores.some((s) => s.id === params.store) ? params.store : ""}
            >
              <option value="" disabled>選択してください</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-ink-400">
            ※ 休み希望日や勤務可能店舗外にも追加できますが、表と警告欄に印が付きます（最終判断は管理者）。
          </p>
          <button type="submit" className="btn-primary w-full">追加する</button>
        </form>
      </section>
    </div>
  );
}
