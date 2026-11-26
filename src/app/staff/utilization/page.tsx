import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { utilizationDaily } from "@/lib/data/tables";
import { requireViewer, canSeeMember, isEyesStore } from "@/lib/viewer";
import { addMonths, formatDateJa, formatMonthJa, thisMonthJst, todayJst } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { formatMinutesJa } from "@/lib/eni/forms";
import { DEFINITIONS, ensureMonthComputed, getUtilizationSettings, isUtilTarget, monthUtilization } from "@/lib/utilization";
import { isSalonOneConfigured } from "@/lib/salonone";
import { MonthNav, PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { fixUtilizationAction, saveServedMinutesAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼17：稼働率・巻いた時間・オーバー時間。本人は自分の分、幹部・管理者は全員分（幹部は自分の店舗）。
export default async function UtilizationPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; store?: string; ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const month = isMonth(params.month ?? "") ? params.month! : thisMonthJst();
  const canTeam = v.isExec || v.isStoreManager;
  const view = canTeam && params.view === "team" ? "team" : "me";
  await ensureMonthComputed(db, month).catch(() => undefined);
  const [staff, stores, settings] = await Promise.all([db.listStaff(), db.listStores(), getUtilizationSettings(db)]);
  const me = staff.find((s) => s.id === v.staffId);
  const myStore = stores.find((s) => s.id === me?.storeId);
  const eyesMe = isEyesStore(myStore);
  const tone = (rate: number | null) => (rate === null ? "text-ink-400" : rate >= settings.goodRate ? "text-emerald-700" : rate < settings.lowRate ? "text-red-600" : "text-amber-700");
  const q = (patch: Record<string, string>) => `/staff/utilization?${new URLSearchParams({ month, view, ...patch }).toString()}`;

  const members = staff.filter((s) => isUtilTarget(s, isEyesStore(stores.find((x) => x.id === s.storeId))) && canSeeMember(v, s));
  const targetIds = view === "team" ? members.map((m) => m.id) : [v.staffId];
  const utils = await monthUtilization(month, targetIds);
  const mine = utils.find((u) => u.staffId === v.staffId);

  return (
    <div className="page-narrow">
      <PageHeader title="稼働率" backHref="/staff" icon="trendingUp" description="毎日の稼働率・巻いた時間・オーバー時間" />
      <NotReadyNotice table={utilizationDaily} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      {canTeam && (
        <TabLinks
          items={[
            { href: `/staff/utilization?month=${month}&view=me`, label: "自分", active: view === "me" },
            { href: `/staff/utilization?month=${month}&view=team`, label: "みんな", active: view === "team" },
          ]}
        />
      )}
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={q({ month: addMonths(month, -1) })} nextHref={q({ month: addMonths(month, 1) })} />

      {view === "me" ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">月の稼働率</p>
              <p className={`text-xl font-bold ${tone(mine?.rate ?? null)}`}>{mine?.rate !== null && mine?.rate !== undefined ? `${mine.rate}%` : "—"}</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">巻いた時間</p>
              <p className="text-sm font-bold">{mine && mine.days.some((d) => d.procedureCount > 0) ? formatMinutesJa(mine.ahead) : "データなし"}</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[11px] font-bold text-ink-500">オーバー時間</p>
              <p className="text-sm font-bold">{mine && mine.days.some((d) => d.procedureCount > 0) ? formatMinutesJa(mine.over) : "データなし"}</p>
            </div>
          </div>
          {eyesMe && (
            <form action={saveServedMinutesAction} className="card space-y-2 mb-4">
              <p className="section-title !mb-0">施術時間を入れる（イーリス）</p>
              <p className="text-xs text-ink-500">SalonOne から取り込めるようになるまでは、その日の施術時間の合計を入れてください。</p>
              <div className="grid grid-cols-3 gap-2">
                <input name="date" type="date" max={todayJst()} defaultValue={todayJst()} className="input !min-h-11 !py-2 col-span-3" />
                <label className="text-xs font-bold text-ink-600">
                  施術時間（時間）
                  <input name="hours" inputMode="decimal" placeholder="6.5" className="input !min-h-11 !py-2 mt-1" />
                </label>
                <label className="text-xs font-bold text-ink-600">
                  休憩（分）
                  <input name="break" type="number" min={0} placeholder={String(settings.eyesBreakMinutes)} className="input !min-h-11 !py-2 mt-1" />
                </label>
                <button type="submit" className="btn-primary btn-sm self-end">
                  保存
                </button>
              </div>
            </form>
          )}
          {!mine || mine.days.length === 0 ? (
            <EmptyState message="この月の稼働率のデータはまだありません（日報の入客時間を入れると、翌日に出ます）" />
          ) : (
            <ul className="space-y-1.5">
              {[...mine.days].reverse().map((d) => (
                <li key={d.date} className="card !p-3 flex items-center gap-2 text-sm">
                  <span className="w-24 font-bold">{formatDateJa(d.date)}</span>
                  <span className={`font-bold w-16 ${tone(d.status === "missing" ? null : d.rate)}`}>{d.status === "missing" ? "—" : `${d.rate}%`}</span>
                  <span className="text-xs text-ink-500 flex-1 truncate">
                    {d.status === "missing" ? d.note || "データなし" : `${formatMinutesJa(d.servedMinutes)} ／ ${formatMinutesJa(d.capacityMinutes)}`}
                    {d.procedureCount > 0 && `・巻き ${d.aheadMinutes}分・オーバー ${d.overMinutes}分`}
                  </span>
                  {d.status === "missing" && <StatusBadge label="データなし" tone="warning" />}
                  {d.status === "manual" && <StatusBadge label="手直し" tone="muted" />}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-3">
            <Link href={q({ store: "" })} className={`chip shrink-0 ${!params.store ? "chip-active" : ""}`}>
              全店舗
            </Link>
            {stores
              .filter((s) => members.some((m) => m.storeId === s.id))
              .map((s) => (
                <Link key={s.id} href={q({ store: s.id })} className={`chip shrink-0 ${params.store === s.id ? "chip-active" : ""}`}>
                  {s.name}
                </Link>
              ))}
          </div>
          {members.length === 0 ? (
            <EmptyState message="見られるメンバーがいません" />
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>名前</th>
                    <th className="!text-right">月の稼働率</th>
                    <th className="!text-right">入客</th>
                    <th className="!text-right">巻き／オーバー</th>
                    <th className="!text-right">データなし</th>
                  </tr>
                </thead>
                <tbody>
                  {members
                    .filter((m) => !params.store || m.storeId === params.store)
                    .map((m) => {
                      const u = utils.find((x) => x.staffId === m.id);
                      return (
                        <tr key={m.id}>
                          <td className="font-bold">{m.name}</td>
                          <td className={`text-right font-bold ${tone(u?.rate ?? null)}`}>{u?.rate !== null && u?.rate !== undefined ? `${u.rate}%` : "—"}</td>
                          <td className="text-right">{u ? formatMinutesJa(u.served) : "—"}</td>
                          <td className="text-right text-xs">{u && u.days.some((d) => d.procedureCount > 0) ? `${u.ahead}分／${u.over}分` : "データなし"}</td>
                          <td className="text-right">{u?.missingDays ?? 0}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          <details className="card mt-4">
            <summary className="cursor-pointer list-none text-sm font-bold">データなしの日・おかしな日を手で直す（幹部・管理者）</summary>
            <form action={fixUtilizationAction} className="grid grid-cols-2 gap-2 mt-3">
              <select name="staff" className="input !min-h-11 !py-2 col-span-2">
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input name="date" type="date" max={todayJst()} className="input !min-h-11 !py-2 col-span-2" required />
              <label className="text-xs font-bold text-ink-600">
                入客（施術）時間（分）
                <input name="served" type="number" min={0} className="input !min-h-11 !py-2 mt-1" />
              </label>
              <label className="text-xs font-bold text-ink-600">
                回せる時間（分）
                <input name="capacity" type="number" min={1} className="input !min-h-11 !py-2 mt-1" />
              </label>
              <input name="note" className="input !min-h-11 !py-2 col-span-2" placeholder="直した理由" />
              <button type="submit" className="btn-secondary btn-sm col-span-2">
                直す
              </button>
            </form>
          </details>
        </>
      )}

      <section className="mt-5">
        <h2 className="section-title">計算のしかた</h2>
        <ul className="space-y-1.5">
          {DEFINITIONS.map((d) => (
            <li key={d.brand} className="card-quiet !p-2.5 text-xs">
              <span className="font-bold text-ink-800">{d.brand}：{d.formula}</span>
              <span className="block text-ink-500 mt-0.5">{d.note}</span>
            </li>
          ))}
        </ul>
        <Note>
          {isSalonOneConfigured()
            ? "SalonOne から施術の予定・実際の時間を毎日取り込んでいます。"
            : "いまは日報（ENi）・入力（イーリス）で計算しています。2027年1月から SalonOne の施術の時間を取り込みます（サロンボードには外からつなぐ仕組みが無いため、つなぎません）。"}
          毎日の定期実行で前日の分を作ります。
        </Note>
      </section>
    </div>
  );
}
