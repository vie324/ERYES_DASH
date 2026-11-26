// 依頼13：現金出納帳のCSV（Excelで開ける）。見られるのは、その店舗のレジ締めを見られる人だけ。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { viewerOf } from "@/lib/viewer";
import { buildCashBook, canUseCash, getCashSettings } from "@/lib/cash";
import { toCsv } from "@/lib/attendance-shift";
import { thisMonthJst } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const v = await viewerOf(session);
  const db = getDataStore();
  const storeId = req.nextUrl.searchParams.get("store") ?? "";
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("month") ?? "") ? req.nextUrl.searchParams.get("month")! : thisMonthJst();
  const [stores, settings] = await Promise.all([db.listStores(), getCashSettings(db)]);
  const store = stores.find((s) => s.id === storeId);
  if (!store || !(await canUseCash(v, store.id, settings, stores))) return NextResponse.json({ error: "見られません" }, { status: 403 });
  const book = await buildCashBook(db, store.id, month);
  const rows: (string | number)[][] = [
    ["日付", "摘要", "入金", "出金", "残高", "確認"],
    [`${month}-01`, "前月からの繰越", "", "", book.opening, ""],
    ...book.rows.map((r) => [r.date, r.description, r.income || "", r.expense || "", r.balance, r.confirmed ? "確認済み" : ""]),
    ["", "合計", book.totalIn, book.totalOut, book.closing, ""],
  ];
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`現金出納帳_${store.name}_${month}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
