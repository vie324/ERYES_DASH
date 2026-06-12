// 管理者用CSVダウンロード（期間指定）。
// type=sales（既定）: 日報ベースの売上CSV
// type=cash        : レジ締め・現金管理CSV
// TODO: 出力項目は仮。税理士指定の項目を受領したらこのファイルの rows 部分を差し替える。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const type = req.nextUrl.searchParams.get("type") === "cash" ? "cash" : "sales";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return new NextResponse("期間の指定が正しくありません", { status: 400 });
  }

  const db = getDataStore();
  let rows: (string | number)[][];
  let filename: string;

  if (type === "cash") {
    // レジ締め・現金管理CSV
    const [cashReports, stores] = await Promise.all([
      db.listCashReports({ from, to }),
      db.listStores(),
    ]);
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));
    rows = [
      [
        "日付",
        "店舗名",
        "現金売上高",
        "レジ現金残高",
        "おつり準備金残高",
        "金庫へ移動額",
        "金庫現金残高",
        "銀行への預入額",
        "メモ",
      ],
      ...cashReports
        .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.storeId.localeCompare(b.storeId))
        .map((r) => [
          r.reportDate,
          storeMap.get(r.storeId) ?? "（不明）",
          r.cashSales,
          r.registerBalance,
          r.changeFund,
          r.movedToSafe,
          r.safeBalance,
          r.bankDeposit,
          r.memo,
        ]),
    ];
    filename = `eryes_cash_${from.replaceAll("-", "")}-${to.replaceAll("-", "")}.csv`;
  } else {
    // 売上CSV（日報ベース）
    const [reports, staffList] = await Promise.all([
      db.listDailyReports({ from, to }),
      db.listStaff(),
    ]);
    const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
    rows = [
      ["日付", "スタッフ名", "新規人数", "既存人数", "技術売上", "オプション売上", "物販売上", "合計"],
      ...reports
        .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.staffId.localeCompare(b.staffId))
        .map((r) => [
          r.reportDate,
          staffMap.get(r.staffId) ?? "（不明）",
          r.newClients,
          r.repeatClients,
          r.serviceSales,
          r.optionSales,
          r.retailSales,
          r.serviceSales + r.optionSales + r.retailSales,
        ]),
    ];
    filename = `eryes_sales_${from.replaceAll("-", "")}-${to.replaceAll("-", "")}.csv`;
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
