// 依頼13：レジ締め・現金出納帳。
//  ・毎日のレジ締め：釣り銭準備金・現金売上・金種ごとの枚数（1万円〜1円）→ 合計と、帳簿との差額。差額があれば理由が必須。
//    締めた人と、確認した人（幹部）を記録する。確認済みの日は変えられず、直すときは管理者が理由を書く（履歴が残る）
//  ・現金の出し入れ：経費の現金払い・両替・銀行への入金など（日付・摘要・金額・領収書の写真）
//  ・現金出納帳：月ごとに「日付・摘要・入金・出金・残高」を自動で作る。CSVで書き出せる
//  ・入力は店長・副店長（幹部）、閲覧は管理者（店舗の管理者は担当店舗）。スタイリスト以下には見せない
//    （イーリスは今までどおりお店の全員が入力していたので、管理画面で「全員が入力できる店舗」に入れてある。初期値）
//  ・現金売上は今は手入力。SalonOne の API が届いたら取り込める（lib/salonone.ts）
// 今のレジ締め（cash_reports）も、これまでの画面・集計のために、同じ内容で書き続ける。

import { fx } from "@/lib/data/tables";
import type { CashMovement, RegisterClosing } from "@/lib/data/tables";
import { addMonths, datesOfMonth, monthRange } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { staffHasPermission } from "@/lib/permissions";
import { isEyesStore, type Viewer } from "@/lib/viewer";
import type { DataStore, Store } from "@/lib/data/types";

/** 金種（円） */
export const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1] as const;

export interface CashKind {
  key: string;
  label: string;
  direction: "in" | "out" | "none";
}

export const CASH_SETTINGS_KEY = "cash_settings";
export interface CashSettings {
  /** 現金の出し入れの種類（摘要の種類） */
  kinds: CashKind[];
  /** 画面の項目名 */
  labels: { changeFund: string; cashSales: string; counted: string; diffReason: string };
  /** 釣り銭準備金の初期値 */
  defaultChangeFund: number;
  /** 幹部でなくても、お店の全員が入力できる店舗（初期値：イーリスの店舗。schema.sql を流す前の動きと同じ） */
  openStoreIds: string[];
  /** 出納帳の始まり（店舗ごと：何月から・その月のはじめの残高） */
  openings: Record<string, { month: string; balance: number }>;
  /** 初期値のまま（イーリスの店舗を自動で入れるか）。管理画面で保存すると false */
  openStoresAuto: boolean;
}

export const DEFAULT_CASH_SETTINGS: CashSettings = {
  kinds: [
    { key: "expense", label: "経費の支払い", direction: "out" },
    { key: "bank_deposit", label: "銀行へ入金", direction: "out" },
    { key: "change_in", label: "釣り銭の補充", direction: "in" },
    { key: "exchange", label: "両替", direction: "none" },
    { key: "other_in", label: "その他の入金", direction: "in" },
    { key: "other_out", label: "その他の出金", direction: "out" },
  ],
  labels: { changeFund: "釣り銭準備金", cashSales: "現金売上", counted: "レジの中の現金（数えた合計）", diffReason: "差額の理由" },
  defaultChangeFund: 30000,
  openStoreIds: [],
  openings: {},
  openStoresAuto: true,
};

export async function getCashSettings(db: DataStore): Promise<CashSettings> {
  const s = await readJsonSetting(db, CASH_SETTINGS_KEY, DEFAULT_CASH_SETTINGS);
  if (s.kinds.length === 0) s.kinds = DEFAULT_CASH_SETTINGS.kinds;
  s.labels = { ...DEFAULT_CASH_SETTINGS.labels, ...s.labels };
  return s;
}

/** 全員が入力できる店舗（初期値はイーリスの店舗） */
export function openStoresOf(settings: CashSettings, stores: Store[]): Set<string> {
  if (settings.openStoresAuto) return new Set(stores.filter(isEyesStore).map((s) => s.id));
  return new Set(settings.openStoreIds);
}

/** その店舗のレジ締めを見られるか：管理者／担当店舗の店舗の管理者／その店舗の幹部・権限のある人／全員が入力できる店舗の人 */
export async function canUseCash(v: Viewer, storeId: string, settings: CashSettings, stores: Store[]): Promise<boolean> {
  if (v.isAdmin) return true;
  if (v.isStoreManager && v.me?.managedStoreIds.includes(storeId)) return true;
  if (!v.me || v.me.storeId !== storeId) return false;
  if (v.isExec) return true;
  if (openStoresOf(settings, stores).has(storeId)) return true;
  return staffHasPermission(v.me, "cash_input");
}

/** 確認できるか（幹部・店舗の管理者・管理者。自分が締めた日も確認できる） */
export function canConfirmCash(v: Viewer, storeId: string): boolean {
  if (v.isAdmin) return true;
  if (v.isStoreManager && v.me?.managedStoreIds.includes(storeId)) return true;
  return v.isExec && v.me?.storeId === storeId;
}

/** 使える店舗の一覧 */
export async function cashStoresFor(v: Viewer, stores: Store[], settings: CashSettings): Promise<Store[]> {
  const out: Store[] = [];
  for (const s of stores) if (await canUseCash(v, s.id, settings, stores)) out.push(s);
  return out;
}

export function countedTotalOf(denoms: Record<string, number>): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * Math.max(0, Math.round(Number(denoms[String(d)] ?? 0) || 0)), 0);
}

/** その日の現金の出し入れの差し引き（入金 − 出金。両替は数えない） */
export function movementNet(movements: Pick<CashMovement, "direction" | "amount" | "deleted">[]): number {
  return movements.filter((m) => !m.deleted).reduce((s, m) => s + (m.direction === "in" ? m.amount : m.direction === "out" ? -m.amount : 0), 0);
}

/** 帳簿上のレジの現金 ＝ 釣り銭準備金 ＋ 現金売上 ＋ 入金 − 出金 */
export function expectedTotalOf(changeFund: number, cashSales: number, net: number): number {
  return changeFund + cashSales + net;
}

// ---------------------------------------------------------------- 現金出納帳

export interface CashBookRow {
  date: string;
  description: string;
  income: number;
  expense: number;
  balance: number;
  /** 何の行か（売上・出し入れ・過不足） */
  source: "sales" | "movement" | "diff" | "opening";
  receipt: boolean;
  confirmed: boolean;
}

/**
 * 月の現金出納帳。残高は「出納帳の始まり（管理画面で設定）」からの積み上げ。
 * 始まりを決めていない店舗は、その月のはじめを0円として出す。
 */
export async function buildCashBook(
  db: DataStore,
  storeId: string,
  month: string
): Promise<{ rows: CashBookRow[]; opening: number; closing: number; totalIn: number; totalOut: number; startMonth: string }> {
  const settings = await getCashSettings(db);
  const opening = settings.openings[storeId] ?? { month, balance: 0 };
  const startMonth = opening.month <= month ? opening.month : month;
  const from = monthRange(startMonth).from;
  const to = monthRange(month).to;
  const f = fx();
  const [closings, movements] = await Promise.all([
    f.registerClosings.list({ where: { storeId, date: { gte: from, lte: to } } }),
    f.cashMovements.list({ where: { storeId, date: { gte: from, lte: to }, deleted: false }, order: [["date", "asc"], ["createdAt", "asc"]] }),
  ]);
  const kinds = new Map(settings.kinds.map((k) => [k.key, k.label]));
  let balance = opening.month <= month ? opening.balance : 0;
  const rows: CashBookRow[] = [];
  let monthOpening = balance;
  // 始まりの月から、表示する月の前の月までは残高だけ進める
  for (let m = startMonth; m <= month; m = addMonths(m, 1)) {
    if (m === month) monthOpening = balance;
    for (const date of datesOfMonth(m)) {
      const c = closings.find((x) => x.date === date);
      const dayRows: Omit<CashBookRow, "balance">[] = [];
      if (c && c.cashSales > 0) dayRows.push({ date, description: "現金売上", income: c.cashSales, expense: 0, source: "sales", receipt: false, confirmed: Boolean(c.confirmedAt) });
      for (const mv of movements.filter((x) => x.date === date && x.direction !== "none")) {
        const label = kinds.get(mv.kind) ?? mv.kind;
        dayRows.push({
          date,
          description: mv.description ? `${label}：${mv.description}` : label,
          income: mv.direction === "in" ? mv.amount : 0,
          expense: mv.direction === "out" ? mv.amount : 0,
          source: "movement",
          receipt: Boolean(mv.receiptPhoto),
          confirmed: Boolean(c?.confirmedAt),
        });
      }
      if (c && c.diff !== 0) {
        dayRows.push({
          date,
          description: `現金過不足${c.diffReason ? `（${c.diffReason}）` : ""}`,
          income: c.diff > 0 ? c.diff : 0,
          expense: c.diff < 0 ? -c.diff : 0,
          source: "diff",
          receipt: false,
          confirmed: Boolean(c.confirmedAt),
        });
      }
      for (const r of dayRows) {
        balance += r.income - r.expense;
        if (m === month) rows.push({ ...r, balance });
      }
    }
  }
  const totalIn = rows.reduce((s, r) => s + r.income, 0);
  const totalOut = rows.reduce((s, r) => s + r.expense, 0);
  return { rows, opening: monthOpening, closing: monthOpening + totalIn - totalOut, totalIn, totalOut, startMonth };
}

/** 確認済みの日か（その日のレジ締めが確認済みなら、出し入れも含めて変えられない） */
export function isLocked(closing: RegisterClosing | null): boolean {
  return Boolean(closing?.confirmedAt);
}
