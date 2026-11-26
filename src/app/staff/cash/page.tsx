/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, registerClosings } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { addDays, addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, todayJst } from "@/lib/date";
import { isDate, isMonth } from "@/lib/action-utils";
import { isSalonOneConfigured } from "@/lib/salonone";
import { buildCashBook, canConfirmCash, cashStoresFor, getCashSettings, isLocked, movementNet } from "@/lib/cash";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice, TabLinks } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PhotoInput } from "@/components/photo-input";
import { ClosingForm } from "@/components/cash/closing-form";
import { addMovementAction, confirmClosingAction, deleteMovementAction, fetchSalonOneCashAction, saveClosingAction } from "./actions";

export const dynamic = "force-dynamic";

type Tab = "closing" | "movements" | "book" | "history";

// 依頼13：レジ締め・現金出納帳（入力は店長・副店長、閲覧は管理者。スタイリスト以下には見せない）
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; date?: string; month?: string; tab?: string; ok?: string; error?: string; salonone?: string }>;
}) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();
  const [allStores, settings] = await Promise.all([db.listStores(), getCashSettings(db)]);
  const stores = await cashStoresFor(v, allStores, settings);
  if (stores.length === 0) {
    return (
      <div className="page-narrow">
        <PageHeader title="レジ締め・現金出納帳" backHref="/staff" icon="banknote" />
        <EmptyState message="レジ締めは、店長・副店長と管理者が入力します" />
      </div>
    );
  }
  const tab = (["closing", "movements", "book", "history"].includes(params.tab ?? "") ? params.tab : "closing") as Tab;
  const store = stores.find((s) => s.id === params.store) ?? stores.find((s) => s.id === v.me?.storeId) ?? stores[0];
  const date = isDate(params.date ?? "") && params.date! <= today ? params.date! : today;
  const month = isMonth(params.month ?? "") ? params.month! : date.slice(0, 7);
  const f = fx();
  const [closing, movements, legacy, staff] = await Promise.all([
    f.registerClosings.find({ storeId: store.id, date }),
    f.cashMovements.list({ where: { storeId: store.id, date, deleted: false }, order: [["createdAt", "asc"]] }),
    db.getCashReport(store.id, date),
    db.listStaff(),
  ]);
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "";
  const locked = isLocked(closing);
  const prev = closing ? null : await db.getCashReport(store.id, addDays(date, -1));
  const salonOne = params.salonone && /^\d+$/.test(params.salonone) ? Number(params.salonone) : null;
  const q = (patch: Record<string, string>) => `/staff/cash?${new URLSearchParams({ store: store.id, date, tab, ...patch }).toString()}`;

  return (
    <div className="page-narrow">
      <PageHeader title="レジ締め・現金出納帳" backHref="/staff" icon="banknote" />
      <NotReadyNotice table={registerClosings} isAdmin={v.isAdmin} />
      <Flash ok={params.ok} error={params.error} />
      {stores.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-3">
          {stores.map((s) => (
            <Link key={s.id} href={`/staff/cash?store=${s.id}&date=${date}&tab=${tab}`} className={`chip shrink-0 ${s.id === store.id ? "chip-active" : ""}`}>
              {s.name}
            </Link>
          ))}
        </div>
      )}
      <TabLinks
        items={[
          { href: q({ tab: "closing" }), label: "レジ締め", active: tab === "closing" },
          { href: q({ tab: "movements" }), label: "現金の出し入れ", active: tab === "movements" },
          { href: `/staff/cash?store=${store.id}&month=${month}&tab=book`, label: "現金出納帳", active: tab === "book" },
          ...(v.isAdmin ? [{ href: `/staff/cash?store=${store.id}&month=${month}&tab=history`, label: "修正の履歴", active: tab === "history" }] : []),
        ]}
      />

      {(tab === "closing" || tab === "movements") && (
        <div className="flex items-center justify-between card !py-1.5 !px-2 mb-3">
          <Link href={q({ date: addDays(date, -1) })} className="w-11 h-11 grid place-items-center text-brand-600 text-lg" aria-label="前の日">
            ←
          </Link>
          <span className="font-display font-bold">{formatDateJa(date, true)}</span>
          {date < today ? (
            <Link href={q({ date: addDays(date, 1) })} className="w-11 h-11 grid place-items-center text-brand-600 text-lg" aria-label="次の日">
              →
            </Link>
          ) : (
            <span className="w-11 h-11 grid place-items-center text-ink-300 text-lg">→</span>
          )}
        </div>
      )}

      {tab === "closing" && (
        <>
          {closing && (
            <div className="card !p-3.5 mb-3 text-sm space-y-1">
              <p>
                締めた人：<span className="font-bold">{nameOf(closing.closedBy)}</span>
                {closing.closedAt && <span className="text-xs text-ink-400 ml-1">{formatDateTimeJa(closing.closedAt)}</span>}
              </p>
              <p className="flex items-center gap-2">
                確認：
                {closing.confirmedAt ? (
                  <>
                    <StatusBadge label="確認済み" tone="ok" />
                    <span className="font-bold">{nameOf(closing.confirmedBy)}</span>
                    <span className="text-xs text-ink-400">{formatDateTimeJa(closing.confirmedAt)}</span>
                  </>
                ) : (
                  <StatusBadge label="まだ" tone="warning" />
                )}
              </p>
              {!closing.confirmedAt && canConfirmCash(v, store.id) && (
                <form action={confirmClosingAction} className="pt-1">
                  <input type="hidden" name="store" value={store.id} />
                  <input type="hidden" name="date" value={date} />
                  <ConfirmSubmit className="btn-secondary btn-sm w-full" message="確認すると、この日は変えられなくなります（直すときは管理者が理由を書いて直します）。確認しますか？">
                    確認した（幹部）
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          )}
          {locked && !v.isAdmin && <Note tone="warn">確認済みの日です。直すときは管理者に頼んでください。</Note>}
          {isSalonOneConfigured() && !locked && (
            <form action={fetchSalonOneCashAction} className="mb-3">
              <input type="hidden" name="store" value={store.id} />
              <input type="hidden" name="date" value={date} />
              <button type="submit" className="btn-ghost !text-xs">
                SalonOneから現金売上を取り込む
              </button>
            </form>
          )}
          <ClosingForm
            action={saveClosingAction}
            storeId={store.id}
            date={date}
            movementsNet={movementNet(movements)}
            labels={settings.labels}
            locked={locked}
            isAdmin={v.isAdmin}
            salesSource={salonOne !== null ? "salonone" : (closing?.salesSource ?? "manual")}
            initial={{
              changeFund: closing?.changeFund ?? prev?.changeFund ?? settings.defaultChangeFund,
              cashSales: salonOne ?? closing?.cashSales ?? legacy?.cashSales ?? 0,
              denominations: closing?.denominations ?? {},
              diffReason: closing?.diffReason ?? "",
              memo: closing?.memo ?? legacy?.memo ?? "",
              movedToSafe: legacy?.movedToSafe ?? 0,
              nextChangeFund: legacy?.changeFund ?? closing?.changeFund ?? settings.defaultChangeFund,
              safeBalance: legacy?.safeBalance ?? 0,
              bankDeposit: legacy?.bankDeposit ?? 0,
            }}
          />
          <p className="text-[11px] text-ink-400 mt-3">現金売上は今は手入力です。2027年1月から会計がSalonOneに移ったら、APIから取り込めるようにしてあります。</p>
        </>
      )}

      {tab === "movements" && (
        <>
          <form action={addMovementAction} className="card space-y-3">
            <input type="hidden" name="store" value={store.id} />
            <input type="hidden" name="date" value={date} />
            <p className="section-title !mb-0">現金の出し入れを記録する</p>
            <div className="flex flex-wrap gap-2">
              {settings.kinds.map((k, i) => (
                <label key={k.key}>
                  <input type="radio" name="kind" value={k.key} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="chip peer-checked:chip-active cursor-pointer">
                    {k.label}
                    <span className="opacity-60">{k.direction === "in" ? "＋" : k.direction === "out" ? "−" : "±0"}</span>
                  </span>
                </label>
              ))}
            </div>
            <input name="description" className="input" placeholder="摘要（例：コピー用紙・文具）" maxLength={200} />
            <input name="amount" inputMode="numeric" required className="input text-right text-lg font-bold" placeholder="金額（円）" />
            <div>
              <p className="label">領収書の写真</p>
              <PhotoInput name="receipt" label="領収書を選ぶ" />
            </div>
            {locked && v.isAdmin && <textarea name="edit_reason" required rows={2} className="input" placeholder="確認済みの日に足す理由（管理者・必須）" />}
            <ConfirmSubmit className="btn-primary w-full" pendingLabel="記録しています…">
              記録する
            </ConfirmSubmit>
          </form>
          <h2 className="section-title mt-5">この日の出し入れ</h2>
          {movements.length === 0 ? (
            <EmptyState message="この日の出し入れはありません" />
          ) : (
            <ul className="space-y-2">
              {movements.map((m) => (
                <li key={m.id} className="card !p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink-900 flex-1 min-w-0 truncate">
                      {settings.kinds.find((k) => k.key === m.kind)?.label ?? m.kind}
                      {m.description && <span className="font-normal text-ink-600">：{m.description}</span>}
                    </span>
                    <span className={`font-bold tabular-nums ${m.direction === "in" ? "text-emerald-700" : m.direction === "out" ? "text-red-600" : "text-ink-500"}`}>
                      {m.direction === "in" ? "+" : m.direction === "out" ? "−" : "±"}
                      {m.amount.toLocaleString()}円
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-400 mt-0.5">{nameOf(m.createdBy)}・{formatDateTimeJa(m.createdAt)}</p>
                  {m.receiptPhoto && (
                    <details className="mt-1">
                      <summary className="text-xs font-bold text-brand-700 underline cursor-pointer">領収書を見る</summary>
                      <img src={m.receiptPhoto} alt="領収書" className="mt-2 max-h-80 rounded-xl border border-ink-200" />
                    </details>
                  )}
                  {(!locked || v.isAdmin) && (
                    <form action={deleteMovementAction} className="mt-2 flex gap-2 justify-end">
                      <input type="hidden" name="id" value={m.id} />
                      {locked && <input name="edit_reason" required className="input !min-h-9 !py-1 !text-xs flex-1" placeholder="消す理由（管理者）" />}
                      <ConfirmSubmit className="btn-ghost !text-xs !text-red-500" message="この記録を消しますか？">
                        消す
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "book" && <CashBookView storeId={store.id} storeName={store.name} month={month} />}
      {tab === "history" && v.isAdmin && <EditHistory storeId={store.id} month={month} nameOf={nameOf} />}
    </div>
  );
}

async function CashBookView({ storeId, storeName, month }: { storeId: string; storeName: string; month: string }) {
  const book = await buildCashBook(getDataStore(), storeId, month);
  return (
    <>
      <MonthNav month={month} monthLabel={formatMonthJa(month)} prevHref={`/staff/cash?store=${storeId}&month=${addMonths(month, -1)}&tab=book`} nextHref={`/staff/cash?store=${storeId}&month=${addMonths(month, 1)}&tab=book`} />
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="card !p-2.5">
          <p className="text-[11px] text-ink-500 font-bold">月のはじめ</p>
          <p className="font-bold tabular-nums">{book.opening.toLocaleString()}円</p>
        </div>
        <div className="card !p-2.5">
          <p className="text-[11px] text-ink-500 font-bold">入金・出金</p>
          <p className="text-xs font-bold tabular-nums">
            <span className="text-emerald-700">+{book.totalIn.toLocaleString()}</span> / <span className="text-red-600">−{book.totalOut.toLocaleString()}</span>
          </p>
        </div>
        <div className="card !p-2.5">
          <p className="text-[11px] text-ink-500 font-bold">月の終わり</p>
          <p className="font-bold tabular-nums">{book.closing.toLocaleString()}円</p>
        </div>
      </div>
      <p className="text-right mb-2">
        <a href={`/api/cash-book-csv?store=${storeId}&month=${month}`} className="btn-ghost !text-xs">
          CSVで書き出す（Excelで開けます）
        </a>
      </p>
      {book.rows.length === 0 ? (
        <EmptyState message="この月の記録はありません" />
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>日付</th>
                <th>摘要</th>
                <th className="!text-right">入金</th>
                <th className="!text-right">出金</th>
                <th className="!text-right">残高</th>
              </tr>
            </thead>
            <tbody>
              {book.rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-bold">
                    {Number(r.date.slice(8))}日{r.confirmed && <span className="ml-0.5 text-emerald-600">✓</span>}
                  </td>
                  <td className="!whitespace-normal min-w-40">
                    {r.description}
                    {r.receipt && <span className="ml-1 text-[10px] text-ink-400">（領収書あり）</span>}
                  </td>
                  <td className="text-right tabular-nums">{r.income ? r.income.toLocaleString() : ""}</td>
                  <td className="text-right tabular-nums">{r.expense ? r.expense.toLocaleString() : ""}</td>
                  <td className="text-right tabular-nums font-bold">{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-ink-400 mt-2">
        {storeName}の現金出納帳。✓は確認済みの日。残高は、管理画面で決めた「出納帳の始まり」（{book.startMonth}）からの積み上げです。
      </p>
    </>
  );
}

async function EditHistory({ storeId, month, nameOf }: { storeId: string; month: string; nameOf: (id: string | null) => string }) {
  const logs = await fx().cashEditLogs.list({ where: { storeId, date: { gte: `${month}-01`, lte: `${month}-31` } }, order: [["createdAt", "desc"]] });
  return logs.length === 0 ? (
    <EmptyState message="この月に、確認済みの日を直した記録はありません" />
  ) : (
    <ul className="space-y-2">
      {logs.map((l) => (
        <li key={l.id} className="card !p-3.5 text-sm">
          <p className="font-bold">
            {formatDateJa(l.date)}・{l.targetType === "closing" ? "レジ締め" : "現金の出し入れ"}
          </p>
          <p className="text-ink-700">理由：{l.reason}</p>
          <p className="text-[11px] text-ink-400">
            {nameOf(l.editedBy)}・{formatDateTimeJa(l.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
