import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand, BRAND_INFO } from "@/lib/brand";
import { brandStoreIds } from "@/lib/shift/month";
import { listDayoffsWithLegacy } from "@/lib/shift/requests";
import { addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import {
  REQUEST_LEAD_REASON,
  currentTargetMonth,
  isRequestEditable,
  remainingLabel,
  requestDeadline,
} from "@/lib/shift/period";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DayoffForm } from "./dayoff-form";

const ERRORS: Record<string, string> = {
  deadline: "締切を過ぎているため提出できませんでした。変更はお店（管理者）に相談してください。",
  input: "うまく受け取れませんでした。もう一度お試しください。",
  store: "勤務できる店舗を1つ以上選んでください。",
};

// 希望休を出す（スタッフ用）：カレンダーをタップして休みたい日を選び、提出する。
// 最初に開くのは「いま受け付けている月」。締切（例：12月分は9月5日）までは何度でも出し直せる。
export default async function DayoffRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const db = getDataStore();
  const rules = await db.getShiftRules();
  const openMonth = currentTargetMonth(rules, today);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : openMonth;

  const editable = isRequestEditable(month, rules, today);
  const deadline = requestDeadline(month, rules);

  const [me, stores, myDayoffs, record, chosen, prevChosen, myPatterns] = await Promise.all([
    db.getStaff(session.staffId),
    db.listStores(),
    // 旧「シフト希望」で出した休みも入れて見せる（出し直したときに消えないように）
    listDayoffsWithLegacy(db, { staffId: session.staffId, ...monthRange(month) }),
    db.getShiftRequestMonth(session.staffId, month),
    db.listAvailableStores(month, session.staffId),
    db.listAvailableStores(addMonths(month, -1), session.staffId),
    db.listWorkPatterns(session.staffId),
  ]);

  // 勤務できる店舗の初期値：この月に選んだ店舗 → 前の月に選んだ店舗 → 所属店舗
  const storeIdSet = new Set(stores.map((s) => s.id));
  const initialStoreIds = [chosen, prevChosen]
    .map((rows) => rows.map((r) => r.storeId).filter((id) => storeIdSet.has(id)))
    .find((ids) => ids.length > 0) ?? (me && storeIdSet.has(me.storeId) ? [me.storeId] : []);

  // 店舗を選んでもらうのは、選ぶ意味があるときだけ（今の業態の店舗が2つ以上／ほかの業態の店舗を選んでいる）。
  // それ以外は選ばない＝所属店舗に入る（ENiの人にアイサロンの店舗まで並べない）
  const brand = (await getBrand()) ?? "eni";
  const brandStores = new Set(brandStoreIds(stores, BRAND_INFO[brand].label));
  const selectable = stores.filter((s) => brandStores.has(s.id) || initialStoreIds.includes(s.id));
  const showStores = stores.length > 1 && selectable.length > 1;

  // 基本パターンでお休みの曜日（出勤する曜日が1つでもあるパターンのときだけ）
  const regularOffWeekdays = myPatterns.some((p) => p.isWorking)
    ? [0, 1, 2, 3, 4, 5, 6].filter((wd) => !myPatterns.some((p) => p.weekday === wd && p.isWorking))
    : [];

  const submitted = Boolean(record) || myDayoffs.length > 0;
  const closedMessage =
    month < thisMonthJst()
      ? "過ぎた月のため見るだけです。"
      : `締切（${formatDateJa(deadline, true)}）を過ぎたため変更できません。変更はお店（管理者）に相談してください。`;

  return (
    <div className="page-narrow">
      <PageHeader
        title="希望休を出す"
        backHref="/staff/schedule"
        backLabel="シフトへ戻る"
        description="先の月の休みたい日を、締切までに出します"
      />

      {params.saved && (
        <div className="note note-ok mb-4 flex items-start gap-2">
          <Icon name="checkCircle" className="w-5 h-5 shrink-0" />
          <span>
            {formatMonthJa(month)}分の希望休を提出しました（休み{myDayoffs.length}日）。
            <span className="block font-normal text-xs mt-0.5">
              締切（{formatDateJa(deadline)}）までは何度でも直せます。
              <Link href="/staff/schedule" className="underline ml-1">
                シフトに戻る
              </Link>
            </span>
          </span>
        </div>
      )}
      {params.error && <p className="note note-danger mb-4">{ERRORS[params.error] ?? ERRORS.input}</p>}

      {/* 締切と提出状況 */}
      <div className={`card mb-4 ${editable ? "" : "!bg-ink-50"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-ink-900">{formatMonthJa(month)}分</span>
          {editable ? (
            <span className="rounded-full bg-brand-100 text-brand-800 text-xs font-bold px-2.5 py-0.5">
              受付中・{remainingLabel(month, rules, today)}
            </span>
          ) : (
            <span className="rounded-full bg-ink-200 text-ink-600 text-xs font-bold px-2.5 py-0.5">受付終了</span>
          )}
          <span
            className={`rounded-full text-xs font-bold px-2.5 py-0.5 ${
              submitted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {submitted ? "提出済み" : "未提出"}
          </span>
        </div>
        <p className="text-sm text-ink-600 mt-1.5">
          締切：<span className="font-bold">{formatDateJa(deadline, true)}</span>
          {record && <span className="text-xs text-ink-400 ml-2">最後の提出 {formatDateTimeJa(record.updatedAt)}</span>}
        </p>
        {month !== openMonth && (
          <p className="text-xs text-ink-500 mt-1">
            いま受け付けている月は{" "}
            <Link href={`/staff/schedule/dayoff?month=${openMonth}`} className="font-bold text-brand-700 underline">
              {formatMonthJa(openMonth)}分
            </Link>
            です。
          </p>
        )}
      </div>

      <DayoffForm
        key={`${month}:${record?.updatedAt.getTime() ?? 0}:${myDayoffs.length}`}
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/schedule/dayoff?month=${addMonths(month, -1)}`}
        nextHref={`/staff/schedule/dayoff?month=${addMonths(month, 1)}`}
        editable={editable}
        closedMessage={closedMessage}
        initialDays={myDayoffs.map((r) => ({ date: r.date, reason: r.reason, paidLeave: r.paidLeave }))}
        initialStoreIds={initialStoreIds}
        initialNote={record?.note ?? ""}
        stores={showStores ? selectable.map((s) => ({ id: s.id, name: s.name })) : []}
        regularOffWeekdays={regularOffWeekdays}
        isStylist={me?.jobType === "stylist"}
      />

      <div className="card mt-4 text-xs text-ink-500 space-y-1 leading-relaxed">
        <p className="font-bold text-ink-700">希望休のきまり</p>
        <p>・{rules.requestLeadMonths}ヶ月先の分を、毎月{rules.requestDeadlineDay}日までに出します。{REQUEST_LEAD_REASON}</p>
        <p>・休みが要らない月も「休みなしで提出する」を押してください（提出したことがお店に伝わります）。</p>
        <p>・締切までは何度でも出し直せます。出し直すと、その月の内容がまるごと今の内容に置きかわります。</p>
        <p>・締切後の変更は、お店（管理者）に相談してください。</p>
      </div>
    </div>
  );
}
