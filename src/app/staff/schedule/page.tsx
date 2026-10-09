import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand, BRAND_INFO } from "@/lib/brand";
import { addMonths, formatDateTimeJa, formatMonthJa, thisMonthJst, todayJst } from "@/lib/date";
import { brandStoreIds, shortStoreName, staffForStores } from "@/lib/shift/month";
import { loadMonthSchedule } from "@/lib/shift/load";
import { currentTargetMonth, deadlineLabel, isNoticePeriod, remainingLabel } from "@/lib/shift/period";
import { getMyRequestStatus } from "@/lib/shift/requests";
import { MonthNav, PageHeader, ScrollHint, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MyShiftList, ShiftPersonTable, ShiftStoreTable } from "@/components/shift-table";

// シフト（スタッフ用）：自分の1ヶ月・みんなのシフト・希望休の提出への入口を1画面に。
// 以前は「出勤スケジュール」と「旧シフト機能（早番・遅番）」の2画面に分かれていて、
// 確定したシフトは画面のいちばん下のリンクから別の画面を開かないと見られなかった。
export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; store?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const view = params.view === "store" ? "store" : "person";

  const db = getDataStore();
  const brand = (await getBrand()) ?? "eni";
  const rules = await db.getShiftRules();
  const openMonth = currentTargetMonth(rules, today);
  const [loaded, myRequest] = await Promise.all([
    loadMonthSchedule(db, month, false),
    getMyRequestStatus(db, session.staffId, openMonth),
  ]);
  const { schedule, stores, activeStaff } = loaded;
  const multiStore = stores.length > 1;

  // 店舗の絞り込み（既定は今の業態の店舗。2店舗以上のときだけ）
  const defaultStores = brandStoreIds(stores, BRAND_INFO[brand].label);
  const storeFilter =
    params.store === "all"
      ? stores.map((s) => s.id)
      : stores.some((s) => s.id === params.store)
        ? [params.store!]
        : defaultStores;
  const filterKey = params.store === "all" || stores.some((s) => s.id === params.store) ? params.store! : "";
  const shownStores = stores.filter((s) => storeFilter.includes(s.id));
  const members = staffForStores(activeStaff, schedule, storeFilter, { keepIds: [session.staffId] }).sort(
    (a, b) => Number(b.id === session.staffId) - Number(a.id === session.staffId)
  );

  const myCells = schedule.dates.map((d) => schedule.cell(session.staffId, d));
  const workDays = myCells.filter((c) => c.working).length;
  const dayoffDays = myCells.filter((c) => !c.working && c.dayoff).length;
  const noPlan = myCells.every((c) => !c.working && c.source === "none");

  const href = (patch: { month?: string; view?: string; store?: string }) => {
    const q = new URLSearchParams();
    q.set("month", patch.month ?? month);
    const v = patch.view ?? (view === "store" ? "store" : "");
    if (v) q.set("view", v);
    const st = patch.store ?? filterKey;
    if (st) q.set("store", st);
    return `/staff/schedule?${q.toString()}`;
  };
  const [oy, om] = openMonth.split("-").map(Number);
  const noticeNow = isNoticePeriod(openMonth, rules, today);

  return (
    <div>
      <PageHeader title="シフト" backHref="/staff" icon="calendar" description="自分の出勤予定・みんなのシフト・希望休" />

      {/* 希望休の提出（いま受け付けている月） */}
      <Link
        href={`/staff/schedule/dayoff?month=${openMonth}`}
        className={`card flex items-center gap-3 mb-4 ${
          !myRequest.submitted && noticeNow ? "!border-brand-400 !bg-brand-50" : ""
        }`}
      >
        <span className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-white border border-brand-200 text-brand-600">
          <Icon name="pencil" className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-ink-900">
            {oy}年{om}月分の希望休を{myRequest.submitted ? "直す" : "出す"}
          </span>
          <span className="block text-xs text-ink-500 mt-0.5">
            締切 {deadlineLabel(openMonth, rules)}（{remainingLabel(openMonth, rules, today)}）
            {myRequest.submitted &&
              `・休み${myRequest.days}日${myRequest.updatedAt ? `・${formatDateTimeJa(myRequest.updatedAt)} 提出` : ""}`}
          </span>
        </span>
        {myRequest.submitted ? (
          <StatusBadge label="提出済み" tone="ok" />
        ) : (
          <StatusBadge label="未提出" tone={noticeNow ? "pending" : "muted"} />
        )}
        <Icon name="chevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
      </Link>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={href({ month: addMonths(month, -1) })}
        nextHref={href({ month: addMonths(month, 1) })}
      />

      {schedule.status === "confirmed" ? (
        <p className="note note-ok mb-4 flex items-center gap-2">
          <Icon name="checkCircle" className="w-4 h-4 shrink-0" />
          この月のシフトは確定しています
        </p>
      ) : (
        <p className="note note-warn mb-4 !font-normal">
          <span className="font-bold">
            {schedule.status === "draft" ? "この月のシフトは作成中です。" : "この月のシフトはまだ確定していません。"}
          </span>
          いつもの出勤日（基本パターン）と希望休から出した予定です。確定すると、ここが確定したシフトに変わります。
        </p>
      )}

      {/* ---- 自分の1ヶ月 ---- */}
      <section className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="section-title !mb-0 flex-1">自分のシフト</h2>
          <span className="text-xs font-bold text-ink-600">
            出勤 <span className="text-brand-700 text-sm">{workDays}</span>日
            {dayoffDays > 0 && <span className="ml-2">希望休 {dayoffDays}日</span>}
          </span>
        </div>
        {noPlan ? (
          <p className="text-sm text-ink-500">
            いつもの出勤日（基本パターン）がまだ登録されていないため、予定を出せません。お店（管理者）に登録をお願いしてください。
          </p>
        ) : (
          <MyShiftList
            schedule={schedule}
            staffId={session.staffId}
            stores={stores}
            showStore={multiStore}
            homeStoreId={activeStaff.find((s) => s.id === session.staffId)?.storeId ?? ""}
          />
        )}
      </section>

      {/* ---- みんなのシフト ---- */}
      <section className="card">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <h2 className="section-title !mb-0 flex-1">みんなのシフト</h2>
          {multiStore && (
            <div className="flex gap-1.5">
              <Link href={href({ view: "" })} className={`chip ${view === "person" ? "chip-active" : ""}`}>
                人ごと
              </Link>
              <Link href={href({ view: "store" })} className={`chip ${view === "store" ? "chip-active" : ""}`}>
                店舗ごと
              </Link>
            </div>
          )}
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
        {view === "store" && multiStore ? (
          <ShiftStoreTable schedule={schedule} staff={members} stores={shownStores} viewerId={session.staffId} />
        ) : (
          <ShiftPersonTable
            schedule={schedule}
            staff={members}
            stores={stores}
            viewerId={session.staffId}
            showStore={
              new Set(
                members.flatMap((m) => schedule.dates.map((d) => schedule.cell(m.id, d))).filter((c) => c.working).map((c) => c.storeId)
              ).size > 1
            }
          />
        )}
        <ScrollHint text="横にスクロールすると他のスタッフも見られます" />
        <p className="text-xs text-ink-400 mt-2 leading-relaxed">
          「10-19」＝10:00〜19:00の出勤、「早」「遅」＝早番・遅番、「休」＝休み（希＝希望休・有＝有休）。
          {multiStore && view === "person" && "色の点は出勤する店舗です（「店舗ごと」で店舗別に見られます）。"}
        </p>
      </section>
    </div>
  );
}
