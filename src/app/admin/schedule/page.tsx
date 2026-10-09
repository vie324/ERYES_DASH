import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand, BRAND_INFO } from "@/lib/brand";
import { resolveShiftView, viewStatus } from "@/lib/shift/view";
import { addDays, addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, thisMonthJst, todayJst, weekdayOf } from "@/lib/date";
import { computeBoardWarnings, countBoardWarnings, TOP_TIER, type BoardWarnings } from "@/lib/shift/assign";
import { buildShiftMonthInputs, meetingNamesOn } from "@/lib/shift/context";
import {
  brandStoreIds,
  buildMonthSchedule,
  SHIFT_STATUS_LABEL,
  shiftStatusOf,
  shortNames,
  shortStoreName,
} from "@/lib/shift/month";
import {
  buildTargetMonth,
  currentTargetMonth,
  deadlineLabel,
  isRequestEditable,
  remainingLabel,
} from "@/lib/shift/period";
import { MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ConfirmSubmit } from "@/components/confirm-submit";
import type { DataStore, Staff } from "@/lib/data/types";
import {
  discardDraftAction,
  generateShiftAction,
  publishShiftAction,
  unpublishShiftAction,
} from "./actions";
import { ShiftBoard, type BoardCell, type BoardStaff } from "./shift-board";

const DONE: Record<string, string> = {
  published: "スタッフに公開しました。スタッフのシフト画面がこの内容に変わり、通知も送りました。",
  unpublished: "公開をやめて下書きに戻しました（スタッフには、いつもどおりの予定が出ています）。",
  discarded: "下書きを削除しました（いつもどおりの予定に戻りました）。",
};
const ERRORS: Record<string, string> = {
  confirmed: "公開中の月は作り直せません。作り直すときは、先に「公開をやめて下書きに戻す」を押してください。",
  empty: "シフト表がまだありません。先に「シフト表を自動で作る」を押してください。",
  nostaff:
    "自動で作れる人がいません。スタッフの基本パターン（いつもの出勤日）を登録するか、希望休の提出を待ってください。",
  input: "うまく受け取れませんでした。もう一度お試しください。",
};

/**
 * 最初に開く月：今月から「いま作る月」までで、まだ公開していない最初の月（無ければ今月）。
 * 表に出す店舗に所属する人のシフト表だけを見る（ほかの業態の公開状況に引っぱられない）
 */
async function defaultMonth(
  db: DataStore,
  thisMonth: string,
  buildMonth: string,
  staffIds: Set<string>
): Promise<string> {
  const months: string[] = [];
  for (let m = thisMonth; m <= buildMonth && months.length < 13; m = addMonths(m, 1)) months.push(m);
  const statuses = await Promise.all(
    months.map(async (m) => shiftStatusOf((await db.listShiftAssignments(m)).filter((a) => staffIds.has(a.staffId))))
  );
  // シフト表を使っていない（基本パターンだけで回している）お店は今月を開く
  if (statuses.every((s) => s === "none")) return thisMonth;
  const idx = statuses.findIndex((s) => s !== "confirmed");
  return idx === -1 ? thisMonth : months[idx];
}

/** 職種の補足（表の見出しのツールチップ・編集パネル用） */
function staffSub(s: Staff): string {
  if (s.jobType === "stylist") return `スタイリスト・${s.tiers}段`;
  if (s.jobType === "assistant") {
    const rank = { first: "ファースト", middle: "ミドル", final: "ファイナル", "": "" }[s.rank];
    return rank ? `アシスタント・${rank}` : "アシスタント";
  }
  return "";
}

// シフト（管理者用）：希望休の集まり具合 → シフト表の自動作成（下書き）→ 表をタップして調整 → 公開 を1画面で。
// 以前は「出勤スケジュール」と「旧シフト機能（割当ボード）」が別々で、片方の希望休がもう片方に入らなかった。
export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    store?: string;
    edit?: string;
    done?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();
  const brand = (await getBrand()) ?? "eni";
  const rules = await db.getShiftRules();
  const thisMonth = thisMonthJst();
  const openMonth = currentTargetMonth(rules, today);
  const buildMonth = buildTargetMonth(rules, today);
  let month = params.month ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const [allStores, allStaff] = await Promise.all([db.listStores(), db.listStaff()]);
    const brandStores = new Set(
      params.store === "all" || !params.store
        ? params.store === "all"
          ? allStores.map((s) => s.id)
          : brandStoreIds(allStores, BRAND_INFO[brand].label)
        : [params.store]
    );
    const homeIds = new Set(allStaff.filter((s) => s.isActive && brandStores.has(s.storeId)).map((s) => s.id));
    month = await defaultMonth(db, thisMonth, buildMonth, homeIds);
  }

  const inputs = await buildShiftMonthInputs(db, month);
  const { stores, activeStaff, assignments, requestStatuses } = inputs;
  const schedule = buildMonthSchedule({
    month,
    staff: activeStaff,
    patterns: inputs.patternRows,
    dayoffs: inputs.dayoffs,
    overrides: inputs.overrideRows,
    assignments,
    showDraft: true,
  });
  const staffMap = new Map(inputs.staffList.map((s) => [s.id, s]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const nameOf = (id: string) => staffMap.get(id)?.name ?? "？";
  const shortName = shortNames(activeStaff);
  const familyOf = (id: string) => shortName.get(id) ?? nameOf(id).split(/\s+/)[0];
  const committeeNames = new Map((await db.listCommittees()).map((c) => [c.committeeKey, c.name]));

  // ---- 店舗の絞り込み（既定は今の業態の店舗）。月の操作も、この表に出ている人にだけ効く ----
  const multiStore = stores.length > 1;
  const view = resolveShiftView({
    stores,
    activeStaff,
    schedule,
    storeParam: params.store,
    brandLabel: BRAND_INFO[brand].label,
  });
  const { filterKey, storeFilter, defaultStores } = view;
  const shownStores = stores.filter((s) => storeFilter.includes(s.id));
  const jobOrder = { stylist: 0, assistant: 1, "": 2 } as const;
  const boardMembers = view.members
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        (storeFilter.indexOf(a.s.storeId) + 1 || 99) - (storeFilter.indexOf(b.s.storeId) + 1 || 99) ||
        jobOrder[a.s.jobType] - jobOrder[b.s.jobType] ||
        b.s.tiers - a.s.tiers ||
        a.i - b.i
    )
    .map(({ s }) => s);
  const memberIds = view.memberIds;
  // この表に出ている人のシフト表の状態（ほかの業態の人の公開状況は見ない）
  const status = viewStatus(assignments, memberIds);
  // 警告は「実際に出勤する日」で見る（シフト表に入っていない人は、いつもどおりの予定で数える）
  const effective = activeStaff.flatMap((s) =>
    schedule.dates
      .map((d) => schedule.cell(s.id, d))
      .filter((c) => c.working)
      .map((c) => ({ date: c.date, staffId: s.id, storeId: c.storeId }))
  );
  const allWarnings = status === "none" ? null : computeBoardWarnings(month, effective, inputs);

  // 気になる所は、いま表に出している店舗・スタッフの分だけ（ほかの業態の店舗の人数不足まで並べない）
  const warnings: BoardWarnings | null = allWarnings && {
    coverage: allWarnings.coverage.filter((w) => storeFilter.includes(w.storeId)),
    offConflicts: allWarnings.offConflicts.filter((w) => memberIds.has(w.staffId)),
    storeConflicts: allWarnings.storeConflicts.filter((w) => memberIds.has(w.staffId)),
    consecutive: allWarnings.consecutive.filter((w) => memberIds.has(w.staffId)),
    stylistOffOverlap: allWarnings.stylistOffOverlap
      .map((w) => {
        const staffIds = w.staffIds.filter((id) => memberIds.has(id));
        const top = staffIds.filter((id) => (staffMap.get(id)?.tiers ?? 1) >= TOP_TIER).length >= 2;
        return { ...w, staffIds, top };
      })
      .filter((w) => w.staffIds.length >= 2),
    noStylist: allWarnings.noStylist.filter((w) => storeFilter.includes(w.storeId)),
    meetingAbsent: allWarnings.meetingAbsent.filter((w) => memberIds.has(w.staffId)),
    surplus: allWarnings.surplus
      .map((w) => ({ ...w, staffIds: w.staffIds.filter((id) => memberIds.has(id)) }))
      .filter((w) => w.staffIds.length > 0),
  };
  const warningCount = warnings ? countBoardWarnings(warnings) : 0;

  // ---- 表に渡すデータ ----
  const cells: Record<string, BoardCell> = {};
  for (const s of boardMembers) {
    for (const date of schedule.dates) {
      const c = schedule.cell(s.id, date);
      cells[`${s.id}|${date}`] = {
        w: c.working,
        s: c.startTime,
        e: c.endTime,
        st: c.storeId,
        t: c.shiftType,
        n: c.note,
        src: c.source,
        d: c.dayoff ? { r: c.dayoff.reason, p: c.dayoff.paidLeave } : null,
      };
    }
  }
  const patterns: Record<string, ({ s: string; e: string } | null)[]> = {};
  for (const [staffId, days] of inputs.patterns) {
    if (!memberIds.has(staffId)) continue;
    patterns[staffId] = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
      const d = days.get(wd);
      return d?.isWorking ? { s: d.startTime, e: d.endTime } : null;
    });
  }
  // 人数の欄に出す店舗：誰かが入れる店舗・その月に誰かが出勤する店舗だけ（誰も関わらない店舗の「0人」は出さない）
  const activeStoreIds = new Set<string>([
    ...[...inputs.availableStores.values()].flatMap((set) => [...set]),
    ...schedule.dates.flatMap((d) => activeStaff.map((s) => schedule.cell(s.id, d)).filter((c) => c.working).map((c) => c.storeId)),
  ]);
  const countStores = shownStores.filter((st) => activeStoreIds.has(st.id));
  const counts: Record<string, { storeId: string; n: number }[]> = {};
  for (const date of schedule.dates) {
    counts[date] = countStores.map((st) => ({
      storeId: st.id,
      n: activeStaff.filter((s) => {
        const c = schedule.cell(s.id, date);
        return c.working && c.storeId === st.id;
      }).length,
    }));
  }
  const overRun: string[] = [];
  const dayNotes: Record<string, string[]> = {};
  const note = (date: string, text: string) => (dayNotes[date] ??= []).push(text);
  if (warnings) {
    for (const w of warnings.consecutive) {
      // 上限を超えた日（連勤の最後の「超えた分」）に印を付ける
      const over = w.length - rules.maxConsecutiveDays;
      for (let i = 0; i < over; i++) overRun.push(`${w.staffId}|${addDays(w.to, -i)}`);
    }
    for (const w of warnings.coverage) {
      note(w.date, `${shortStoreName(storeMap.get(w.storeId)?.name ?? "")}が${w.assigned}人（最低${w.required}人）`);
    }
    for (const w of warnings.stylistOffOverlap) {
      note(w.date, `スタイリストの休みが重なり：${w.staffIds.map(familyOf).join("・")}`);
    }
    for (const w of warnings.noStylist) {
      note(w.date, `${shortStoreName(storeMap.get(w.storeId)?.name ?? "")}にスタイリストがいない`);
    }
    for (const w of warnings.meetingAbsent) {
      note(w.date, `${familyOf(w.staffId)}さんは${meetingNamesOn(inputs.meetings, w.date, committeeNames) || "会議"}の参加者`);
    }
  }
  const boardStaff: BoardStaff[] = boardMembers.map((s) => ({
    id: s.id,
    name: s.name,
    storeId: s.storeId,
    sub: staffSub(s),
    inShift: schedule.fromShift(s.id),
  }));
  // 表で扱う店舗：絞り込みの店舗＋表のスタッフが出勤する店舗（編集パネルで選べる店舗・色の凡例）
  const memberWorkStores = new Set(
    boardMembers.flatMap((s) => schedule.dates.map((d) => schedule.cell(s.id, d))).filter((c) => c.working).map((c) => c.storeId)
  );
  const boardStores = stores.filter((st) => storeFilter.includes(st.id) || memberWorkStores.has(st.id));
  // 店舗の色の点は、表の中で2つ以上の店舗にまたがるときだけ出す（1店舗なら毎マスに点があっても邪魔なので）
  const showStoreDots = memberWorkStores.size > 1 || countStores.length > 1;
  const [editStaff, editDate] = (params.edit ?? "").split("|");
  const initialEdit =
    editStaff && memberIds.has(editStaff) && editDate?.startsWith(`${month}-`) ? { staffId: editStaff, date: editDate } : null;

  // ---- 希望休の集まり具合 ----
  const rosterIds = new Set(inputs.staffIds);
  const requestEditable = isRequestEditable(month, rules, today);
  const relevantStaff = boardMembers.filter((s) => rosterIds.has(s.id) || requestStatuses.has(s.id));
  const submittedCount = relevantStaff.filter((s) => requestStatuses.get(s.id)?.submitted).length;
  const unsubmitted = relevantStaff.filter((s) => !requestStatuses.get(s.id)?.submitted);
  const excluded = boardMembers.filter((s) => inputs.excludedStaffIds.includes(s.id));
  const dayoffsByStaff = new Map<string, typeof inputs.dayoffs>();
  for (const d of inputs.dayoffs) {
    if (!dayoffsByStaff.has(d.staffId)) dayoffsByStaff.set(d.staffId, []);
    dayoffsByStaff.get(d.staffId)!.push(d);
  }
  // 同じ日に休み希望が重なっている日（理由を見て決める材料）
  const overlapDates = [...new Set(inputs.dayoffs.map((d) => d.date))]
    .filter((date) => inputs.dayoffs.filter((d) => d.date === date && memberIds.has(d.staffId)).length >= 2)
    .sort();

  const href = (patch: { month?: string; store?: string }) => {
    const q = new URLSearchParams();
    q.set("month", patch.month ?? month);
    const st = patch.store ?? filterKey;
    if (st) q.set("store", st);
    return `/admin/schedule?${q.toString()}`;
  };
  const monthChip = (m: string, label: string) => (
    <Link key={label} href={href({ month: m })} className={`chip ${m === month ? "chip-active" : ""}`}>
      {label} {Number(m.slice(5))}月
    </Link>
  );
  const flash =
    params.done === "generated"
      ? `下書きを作りました。${
          warningCount > 0
            ? `気になる所が${warningCount}件あります。下の一覧と表の赤い印を見て、マスをタップして直してください。`
            : "表を確認して、よければスタッフに公開してください。"
        }`
      : DONE[params.done ?? ""];

  return (
    <div>
      <PageHeader
        title="シフト"
        backHref="/admin"
        icon="calendar"
        description="希望休の確認 → 下書きを自動で作る → タップで調整 → スタッフに公開"
        actions={
          <>
            <Link href="/admin/schedule/patterns" className="btn-ghost !text-xs">
              <Icon name="repeat" className="w-4 h-4" />
              基本パターン
            </Link>
            <Link href="/admin/schedule/settings" className="btn-ghost !text-xs">
              <Icon name="sliders" className="w-4 h-4" />
              ルール
            </Link>
          </>
        }
      />

      {flash && <p className="note note-ok mb-4">{flash}</p>}
      {params.error && <p className="note note-danger mb-4">{ERRORS[params.error] ?? ERRORS.input}</p>}

      <div className="flex gap-1.5 flex-wrap mb-2">
        {monthChip(thisMonth, "今月")}
        {buildMonth > thisMonth && monthChip(buildMonth, "作る月")}
        {monthChip(openMonth, "受付中")}
      </div>
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={href({ month: addMonths(month, -1) })}
        nextHref={href({ month: addMonths(month, 1) })}
      />

      {/* ---- 進め方と状態 ---- */}
      <section className="card mb-4">
        {multiStore && boardMembers.length < activeStaff.length && (
          <p className="text-[11px] text-ink-500 mb-2">
            下のボタン（自動で作る・公開など）は、表に出ている{boardMembers.length}人
            {filterKey === "" ? `（${BRAND_INFO[brand].label}の店舗）` : ""}にだけ効きます。ほかの店舗のシフトは変わりません。
          </p>
        )}
        <ol className="grid gap-2 sm:grid-cols-3">
          <li className="card-quiet">
            <p className="text-[11px] font-bold text-ink-400">1. 希望休を集める</p>
            <p className="font-bold text-ink-900 mt-0.5">
              提出 {submittedCount} / {relevantStaff.length}人
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              締切 {deadlineLabel(month, rules)}（{requestEditable ? remainingLabel(month, rules, today) : "締切済み"}）
            </p>
          </li>
          <li className="card-quiet">
            <p className="text-[11px] font-bold text-ink-400">2. 下書きを作って直す</p>
            <p className="font-bold text-ink-900 mt-0.5">
              シフト表：{SHIFT_STATUS_LABEL[status]}
              {warnings && warningCount > 0 && (
                <span className="ml-2 text-xs font-bold text-red-600">気になる所 {warningCount}件</span>
              )}
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              {status === "none"
                ? "いまは基本パターン＋希望休の予定"
                : `出勤 ${assignments.filter((a) => memberIds.has(a.staffId)).length}件`}
            </p>
          </li>
          <li className="card-quiet">
            <p className="text-[11px] font-bold text-ink-400">3. スタッフに公開</p>
            <p className="mt-1">
              {status === "confirmed" ? (
                <StatusBadge label="公開中" tone="ok" />
              ) : status === "draft" ? (
                <StatusBadge label="まだ公開していません" tone="warning" />
              ) : (
                <StatusBadge label="シフト表なし" tone="muted" />
              )}
            </p>
          </li>
        </ol>

        <div className="mt-3 space-y-2">
          {status === "none" && (
            <>
              <form action={generateShiftAction}>
                <input type="hidden" name="target_month" value={month} />
                <input type="hidden" name="store" value={filterKey} />
                <ConfirmSubmit
                  className="btn-primary w-full"
                  pendingLabel="作っています…"
                  message={
                    requestEditable
                      ? `${formatMonthJa(month)}分はまだ希望休の受付中です（締切 ${deadlineLabel(month, rules)}）。いま作りますか？\n（あとから出た希望休は自動では入りません）`
                      : ""
                  }
                >
                  <Icon name="sparkles" className="w-5 h-5" />
                  シフト表を自動で作る（下書き）
                </ConfirmSubmit>
              </form>
              <p className="text-xs text-ink-500 leading-relaxed">
                基本パターン（いつもの出勤日・時間）と希望休、連勤上限{rules.maxConsecutiveDays}日・1店舗1日{rules.minStaffPerStoreDay}人以上をもとに下書きを作ります。
                作ったあと表のマスをタップして直し、「スタッフに公開する」で確定します。
                シフト表を作らずに、いつもどおりの予定のまま使うこともできます（そのときはマスを直すとすぐスタッフに反映されます）。
              </p>
            </>
          )}
          {status === "draft" && (
            <>
              <form action={publishShiftAction}>
                <input type="hidden" name="target_month" value={month} />
                <input type="hidden" name="store" value={filterKey} />
                <ConfirmSubmit
                  className="btn-primary w-full"
                  pendingLabel="公開しています…"
                  message={`${formatMonthJa(month)}のシフトをスタッフに公開します。${
                    warningCount > 0 ? `\n気になる所が${warningCount}件残っています。` : ""
                  }\nよろしいですか？`}
                >
                  <Icon name="send" className="w-5 h-5" />
                  スタッフに公開する
                </ConfirmSubmit>
              </form>
              <div className="flex gap-2 flex-wrap">
                <form action={generateShiftAction}>
                  <input type="hidden" name="target_month" value={month} />
                  <input type="hidden" name="store" value={filterKey} />
                  <ConfirmSubmit
                    className="btn-secondary !min-h-0 !py-2 !px-3 !text-sm"
                    pendingLabel="作っています…"
                    message="自動で作り直します。いまの下書きと、手で直したところはすべて消えます。よろしいですか？"
                  >
                    自動で作り直す
                  </ConfirmSubmit>
                </form>
                <form action={discardDraftAction}>
                  <input type="hidden" name="target_month" value={month} />
                  <input type="hidden" name="store" value={filterKey} />
                  <ConfirmSubmit
                    className="btn-danger"
                    message="下書きを削除して、いつもどおりの予定（基本パターン＋希望休）に戻します。よろしいですか？"
                  >
                    下書きを削除
                  </ConfirmSubmit>
                </form>
              </div>
              <p className="text-xs text-ink-500">下書きはスタッフには見えません。公開すると、スタッフのシフト画面がこの表に変わります。</p>
            </>
          )}
          {status === "confirmed" && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-ink-600 flex-1 min-w-[12rem]">
                公開中です。表のマスを直すと、すぐスタッフに反映され、本人に通知が届きます。
              </p>
              <form action={unpublishShiftAction}>
                <input type="hidden" name="target_month" value={month} />
                <input type="hidden" name="store" value={filterKey} />
                <ConfirmSubmit
                  className="btn-secondary !min-h-0 !py-2 !px-3 !text-sm"
                  message="公開をやめて下書きに戻します。スタッフには、いつもどおりの予定（基本パターン＋希望休）が出るようになります。よろしいですか？"
                >
                  公開をやめて下書きに戻す
                </ConfirmSubmit>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* ---- 気になる所（警告） ---- */}
      {warnings && (warningCount > 0 || warnings.surplus.length > 0) && (
        <section className="card mb-4 space-y-2">
          <h2 className="section-title !mb-1">気になる所</h2>
          <WarnGroup
            title="人数が足りない日"
            tone="red"
            items={warnings.coverage.map(
              (w) => `${formatDateJa(w.date)}：${shortStoreName(storeMap.get(w.storeId)?.name ?? "")} ${w.assigned}人（最低${w.required}人）`
            )}
          />
          <WarnGroup
            title="希望休の日に出勤になっている"
            tone="red"
            items={warnings.offConflicts.map((w) => {
              const d = inputs.dayoffs.find((x) => x.staffId === w.staffId && x.date === w.date);
              return `${formatDateJa(w.date)}：${nameOf(w.staffId)}${d?.paidLeave ? "（有休）" : ""}${d?.reason ? `・${d.reason}` : ""}`;
            })}
          />
          <WarnGroup
            title={`連勤が${rules.maxConsecutiveDays}日を超えている`}
            tone="red"
            items={warnings.consecutive.map(
              (w) => `${nameOf(w.staffId)}：${formatDateJa(w.from)}〜${formatDateJa(w.to)}で${w.length}連勤`
            )}
          />
          <WarnGroup
            title="3段のスタイリスト同士の休みが重なっている"
            tone="red"
            items={warnings.stylistOffOverlap
              .filter((w) => w.top)
              .map((w) => `${formatDateJa(w.date)}：${w.staffIds.map(familyOf).join("・")}`)}
          />
          <WarnGroup
            title="スタイリストの休みが重なっている"
            tone="amber"
            items={warnings.stylistOffOverlap
              .filter((w) => !w.top)
              .map((w) => `${formatDateJa(w.date)}：${w.staffIds.map(familyOf).join("・")}`)}
          />
          <WarnGroup
            title="スタイリストがいない店舗"
            tone="amber"
            items={warnings.noStylist.map(
              (w) => `${formatDateJa(w.date)}：${shortStoreName(storeMap.get(w.storeId)?.name ?? "")}`
            )}
          />
          <WarnGroup
            title="会議の参加者が休み"
            tone="amber"
            items={warnings.meetingAbsent.map(
              (w) =>
                `${formatDateJa(w.date)}：${nameOf(w.staffId)}（${meetingNamesOn(inputs.meetings, w.date, committeeNames) || "会議"}）`
            )}
          />
          <WarnGroup
            title="本人が選んだ店舗の外に入っている"
            tone="amber"
            items={warnings.storeConflicts.map(
              (w) => `${formatDateJa(w.date)}：${nameOf(w.staffId)} → ${shortStoreName(storeMap.get(w.storeId)?.name ?? "")}`
            )}
          />
          <WarnGroup
            title="人が余っている日（有休を使ってもらう相談の目安）"
            tone="sky"
            items={warnings.surplus.map((s) => `${formatDateJa(s.date)}：${s.staffIds.map(familyOf).join("・")}`)}
          />
        </section>
      )}

      {/* ---- シフト表 ---- */}
      <section className="card mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h2 className="section-title !mb-0 flex-1">
            {status === "none" ? "いつもどおりの予定（基本パターン＋希望休）" : `シフト表（${SHIFT_STATUS_LABEL[status]}）`}
          </h2>
          <span className="text-[11px] text-ink-500">マスをタップして変更</span>
        </div>
        {multiStore && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            <Link
              href={href({ store: "all" })}
              className={`chip ${filterKey === "all" || (filterKey === "" && defaultStores.length === stores.length) ? "chip-active" : ""}`}
            >
              すべての店舗
            </Link>
            {stores.map((s) => (
              <Link
                key={s.id}
                href={href({ store: s.id })}
                className={`chip ${filterKey === s.id || (filterKey === "" && defaultStores.length === 1 && defaultStores[0] === s.id) ? "chip-active" : ""}`}
              >
                {shortStoreName(s.name)}
              </Link>
            ))}
            {filterKey === "" && defaultStores.length > 1 && defaultStores.length < stores.length && (
              <span className="text-[11px] text-ink-400 self-center">（{BRAND_INFO[brand].label}の店舗を表示中）</span>
            )}
          </div>
        )}
        {(excluded.length > 0 || (status === "none" && inputs.unsubmittedStaffIds.some((id) => memberIds.has(id)))) && (
          <div className="text-xs text-ink-500 mb-2 space-y-0.5">
            {excluded.length > 0 && (
              <p>
                自動で作る対象外：{excluded.map((s) => s.name).join("、")}（基本パターン未登録・希望休も未提出）
              </p>
            )}
          </div>
        )}
        {boardStaff.length === 0 ? (
          <p className="text-sm text-ink-500">この店舗のスタッフがいません。</p>
        ) : (
          <ShiftBoard
            key={`${month}:${filterKey}`}
            month={month}
            storeKey={filterKey}
            status={status}
            dates={schedule.dates}
            staff={boardStaff}
            stores={boardStores.map((s) => ({ id: s.id, name: s.name }))}
            showStoreDots={showStoreDots}
            cells={cells}
            patterns={patterns}
            counts={counts}
            shortage={(warnings?.coverage ?? []).map((w) => `${w.date}|${w.storeId}`)}
            offConflict={(warnings?.offConflicts ?? []).map((w) => `${w.staffId}|${w.date}`)}
            overRun={overRun}
            storeConflict={(warnings?.storeConflicts ?? []).map((w) => `${w.staffId}|${w.date}`)}
            dayNotes={dayNotes}
            minStaff={rules.minStaffPerStoreDay}
            initialEdit={initialEdit}
          />
        )}
      </section>

      {/* ---- 出された希望休 ---- */}
      <section className="card">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h2 className="section-title !mb-0 flex-1">出された希望休（{formatMonthJa(month)}分）</h2>
          <span className="text-xs text-ink-500">本人と管理者だけが見られます</span>
        </div>
        {unsubmitted.length > 0 && month >= buildMonth && (
          <p className="note note-warn !font-normal mb-3 text-xs">
            <span className="font-bold">未提出：{unsubmitted.map((s) => s.name).join("、")}</span>
            <span className="block mt-0.5">
              未提出の人は、基本パターン（いつもの出勤日）どおりで作ります。{requestEditable ? "声をかけてください。" : ""}
            </span>
          </p>
        )}
        {overlapDates.length > 0 && (
          <p className="text-xs text-ink-600 mb-3">
            <span className="font-bold text-amber-700">同じ日に休み希望が重なっている日：</span>
            {overlapDates
              .map(
                (date) =>
                  `${formatDateJa(date)}（${inputs.dayoffs
                    .filter((d) => d.date === date && memberIds.has(d.staffId))
                    .map((d) => familyOf(d.staffId))
                    .join("・")}）`
              )
              .join("、")}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {relevantStaff.map((s) => {
            const st = requestStatuses.get(s.id);
            const offs = (dayoffsByStaff.get(s.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
            const chosen = inputs.explicitStores.has(s.id) ? [...(inputs.availableStores.get(s.id) ?? [])] : [];
            return (
              <div key={s.id} className="card-quiet">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-ink-900 flex-1 min-w-0 truncate">{s.name}</p>
                  {st?.submitted ? (
                    <StatusBadge label={`休み${offs.length}日`} tone="ok" />
                  ) : (
                    <StatusBadge label="未提出" tone="warning" />
                  )}
                </div>
                {st?.updatedAt && <p className="text-[11px] text-ink-400">{formatDateTimeJa(st.updatedAt)} 提出</p>}
                {offs.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-ink-700">
                    {offs.map((d) => (
                      <li key={d.date}>
                        <span className={`font-bold ${weekdayOf(d.date) === 0 ? "text-red-500" : weekdayOf(d.date) === 6 ? "text-sky-600" : ""}`}>
                          {formatDateJa(d.date)}
                        </span>
                        {d.paidLeave && <span className="ml-1 rounded bg-rose-100 text-rose-700 px-1 text-[10px] font-bold">有休</span>}
                        {d.reason && <span className="ml-1 text-ink-500">{d.reason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {multiStore && chosen.length > 0 && (
                  <p className="text-xs text-ink-500 mt-1">
                    勤務できる店舗：{chosen.map((id) => shortStoreName(storeMap.get(id)?.name ?? "？")).join("・")}
                  </p>
                )}
                {st?.note && <p className="text-xs text-ink-600 mt-1 whitespace-pre-wrap">連絡：{st.note}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** 警告のまとまり（件数を見出しに、中身は開いて見る） */
function WarnGroup({ title, tone, items }: { title: string; tone: "red" | "amber" | "sky"; items: string[] }) {
  if (items.length === 0) return null;
  const color = {
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
  }[tone];
  return (
    <details className={`rounded-xl border px-3 py-2 ${color}`}>
      <summary className="cursor-pointer text-sm font-bold">
        {title}
        <span className="ml-1.5 rounded-full bg-white/80 px-2 py-0.5 text-xs">{items.length}件</span>
      </summary>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {items.map((t, i) => (
          <li key={`${i}-${t}`}>・{t}</li>
        ))}
      </ul>
    </details>
  );
}
