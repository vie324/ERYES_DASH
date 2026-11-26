// SalonOne（2027年1月から予約・会計が移る別システム）からの取り込みの入口。
// このリポジトリから SalonOne のコードやデータには触らない（CLAUDE.md）。読むのは SalonOne が公開する API だけ。
// API の仕様は酒井さんが共有予定（依頼13・17・18で使う）。仕様が届くまでは、どの関数も null（＝取れない）を返し、
// 画面は手入力・日報の入力で動く。届いたら、この中の fetchJson と各関数の中身だけを仕様に合わせて書けばよい。
//
// 環境変数：SALONONE_API_BASE（APIのURL）・SALONONE_API_KEY（秘密のキー。サーバー側だけで使う）

import { env } from "@/lib/env";

export function isSalonOneConfigured(): boolean {
  return Boolean(env.salonOneApiBase && env.salonOneApiKey);
}

/** 施術1件（稼働率・巻いた時間／オーバー時間に使う） */
export interface SalonOneProcedure {
  /** このアプリのスタッフID（SalonOne の担当者IDとの対応は、仕様が届いたら管理画面で決める） */
  staffId: string;
  date: string;
  /** 予定の所要時間（分） */
  plannedMinutes: number;
  /** 実際にかかった時間（分）。開始・終了が取れないときは null */
  actualMinutes: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

/** 店販の販売1件（在庫の照らし合わせに使う） */
export interface SalonOneRetailSale {
  storeId: string;
  date: string;
  /** 商品の照合キー（バーコードか商品名） */
  productKey: string;
  quantity: number;
}

async function fetchJson(path: string): Promise<unknown | null> {
  if (!isSalonOneConfigured()) return null;
  // TODO(SalonOne)：API仕様が届いたら、認証の付け方・URLの形をここで合わせる
  try {
    const res = await fetch(`${env.salonOneApiBase.replace(/\/$/, "")}${path}`, {
      headers: { authorization: `Bearer ${env.salonOneApiKey}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[salonone] ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as unknown;
  } catch (e) {
    console.error(`[salonone] ${path} の取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** その日・その店舗の現金売上（レジ締めに使う。依頼13）。取れなければ null */
export async function fetchCashSales(storeId: string, date: string): Promise<number | null> {
  const data = (await fetchJson(`/cash-sales?store=${encodeURIComponent(storeId)}&date=${date}`)) as { amount?: unknown } | null;
  const n = Number(data?.amount);
  return data && Number.isFinite(n) ? n : null;
}

/** その日の施術の一覧（依頼17）。取れなければ null */
export async function fetchProcedures(date: string): Promise<SalonOneProcedure[] | null> {
  const data = (await fetchJson(`/procedures?date=${date}`)) as { items?: unknown[] } | null;
  if (!data || !Array.isArray(data.items)) return null;
  return data.items.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      staffId: String(r.staffId ?? ""),
      date,
      plannedMinutes: Number(r.plannedMinutes ?? 0) || 0,
      actualMinutes: r.actualMinutes === null || r.actualMinutes === undefined ? null : Number(r.actualMinutes) || 0,
      startedAt: r.startedAt ? new Date(String(r.startedAt)) : null,
      endedAt: r.endedAt ? new Date(String(r.endedAt)) : null,
    };
  });
}

/** その日の店販の販売（依頼18）。取れなければ null */
export async function fetchRetailSales(date: string): Promise<SalonOneRetailSale[] | null> {
  const data = (await fetchJson(`/retail-sales?date=${date}`)) as { items?: unknown[] } | null;
  if (!data || !Array.isArray(data.items)) return null;
  return data.items.map((raw) => {
    const r = raw as Record<string, unknown>;
    return { storeId: String(r.storeId ?? ""), date, productKey: String(r.productKey ?? ""), quantity: Number(r.quantity ?? 0) || 0 };
  });
}
