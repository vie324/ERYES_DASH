"use client";

// レジ締めの入力（金種ごとの枚数を入れると、その場で合計と帳簿との差額が出る）。保存はサーバーアクション。

import { useMemo, useState } from "react";
import { ConfirmSubmit } from "@/components/confirm-submit";

const DENOMS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1];

export interface ClosingInitial {
  changeFund: number;
  cashSales: number;
  denominations: Record<string, number>;
  diffReason: string;
  memo: string;
  movedToSafe: number;
  nextChangeFund: number;
  safeBalance: number;
  bankDeposit: number;
}

export function ClosingForm({
  action,
  storeId,
  date,
  initial,
  movementsNet,
  labels,
  locked,
  isAdmin,
  salesSource,
}: {
  action: (fd: FormData) => Promise<void>;
  storeId: string;
  date: string;
  initial: ClosingInitial;
  /** その日の現金の出し入れの差し引き（入金 − 出金） */
  movementsNet: number;
  labels: { changeFund: string; cashSales: string; counted: string; diffReason: string };
  /** 確認済み（管理者は理由を書けば直せる） */
  locked: boolean;
  isAdmin: boolean;
  salesSource: "manual" | "salonone";
}) {
  const [changeFund, setChangeFund] = useState(String(initial.changeFund || ""));
  const [cashSales, setCashSales] = useState(String(initial.cashSales || ""));
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(DENOMS.map((d) => [String(d), initial.denominations[String(d)] ? String(initial.denominations[String(d)]) : ""]))
  );
  const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[,，]/g, "")) || 0));
  const counted = useMemo(() => DENOMS.reduce((s, d) => s + d * n(counts[String(d)] ?? ""), 0), [counts]);
  const expected = n(changeFund) + n(cashSales) + movementsNet;
  const diff = counted - expected;
  const readOnly = locked && !isAdmin;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="store" value={storeId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="sales_source" value={salesSource} />
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="card space-y-3">
          <label className="block">
            <span className="label">{labels.changeFund}</span>
            <input name="change_fund" inputMode="numeric" value={changeFund} onChange={(e) => setChangeFund(e.target.value)} className="input text-right text-lg font-bold" placeholder="0" />
          </label>
          <label className="block">
            <span className="label">
              {labels.cashSales}
              {salesSource === "salonone" && <span className="ml-1 text-[11px] text-sky-700">（SalonOneから取り込み）</span>}
            </span>
            <input name="cash_sales" inputMode="numeric" value={cashSales} onChange={(e) => setCashSales(e.target.value)} className="input text-right text-lg font-bold" placeholder="0" />
          </label>
          {movementsNet !== 0 && (
            <p className="text-xs text-ink-500">この日の現金の出し入れ：{movementsNet > 0 ? "+" : ""}{movementsNet.toLocaleString()}円（帳簿に入ります）</p>
          )}
        </div>

        <div className="card">
          <p className="section-title">金種ごとの枚数</p>
          <div className="grid grid-cols-2 gap-2">
            {DENOMS.map((d) => (
              <label key={d} className="flex items-center gap-2 rounded-xl border border-brand-100 px-3 py-1.5">
                <span className="w-16 shrink-0 text-sm font-bold text-ink-700 tabular-nums">{d.toLocaleString()}円</span>
                <input
                  name={`d_${d}`}
                  inputMode="numeric"
                  value={counts[String(d)] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: e.target.value }))}
                  className="w-full min-w-0 bg-transparent text-right text-base font-bold outline-none py-1.5"
                  placeholder="0"
                  aria-label={`${d}円の枚数`}
                />
                <span className="text-xs text-ink-400">枚</span>
              </label>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-ink-50 p-3 space-y-1 text-sm">
            <p className="flex justify-between">
              <span>{labels.counted}</span>
              <span className="font-bold tabular-nums">{counted.toLocaleString()}円</span>
            </p>
            <p className="flex justify-between text-ink-600">
              <span>帳簿（{labels.changeFund}＋{labels.cashSales}＋出し入れ）</span>
              <span className="tabular-nums">{expected.toLocaleString()}円</span>
            </p>
            <p className={`flex justify-between font-bold ${diff === 0 ? "text-emerald-700" : "text-red-600"}`}>
              <span>差額</span>
              <span className="tabular-nums">
                {diff > 0 ? "+" : ""}
                {diff.toLocaleString()}円{diff === 0 ? "（ぴったり）" : diff > 0 ? "（多い）" : "（足りない）"}
              </span>
            </p>
          </div>
          {diff !== 0 && (
            <label className="block mt-3">
              <span className="label text-red-600">{labels.diffReason}（必須）</span>
              <textarea name="diff_reason" defaultValue={initial.diffReason} rows={2} required className="input" placeholder="例）お釣りの渡し間違い（100円多く渡した）" />
            </label>
          )}
        </div>

        <details className="card">
          <summary className="cursor-pointer list-none text-sm font-bold text-ink-700">金庫・銀行（これまでの入力。必要なときだけ）</summary>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {(
              [
                ["moved_to_safe", "金庫へ移動", initial.movedToSafe],
                ["next_change_fund", "翌日の釣り銭準備金", initial.nextChangeFund],
                ["safe_balance", "金庫の残高", initial.safeBalance],
                ["bank_deposit", "銀行への預入", initial.bankDeposit],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name} className="text-xs font-bold text-ink-600">
                {label}
                <input name={name} inputMode="numeric" defaultValue={value || ""} className="input !min-h-11 !py-2 mt-1 text-right" placeholder="0" />
              </label>
            ))}
          </div>
        </details>

        <label className="block card">
          <span className="label">メモ（任意）</span>
          <textarea name="memo" defaultValue={initial.memo} rows={2} className="input" placeholder="例）千円札が少なめ。両替が必要" />
        </label>

        {locked && isAdmin && (
          <label className="block card !border-amber-300">
            <span className="label text-amber-800">確認済みの日を直す理由（管理者・必須）</span>
            <textarea name="edit_reason" rows={2} required className="input" placeholder="例）現金売上の入力ミスを直す" />
          </label>
        )}
      </fieldset>
      {!readOnly && (
        <div className="form-actions">
          <ConfirmSubmit className="btn-primary w-full text-lg" pendingLabel="保存しています…">
            {locked ? "理由を書いて直す" : "レジ締めを保存する"}
          </ConfirmSubmit>
        </div>
      )}
    </form>
  );
}
