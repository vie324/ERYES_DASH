// 売上CSVダウンロード（管理者のみ）。日報を期間指定で出力する。
// TODO: 出力項目は仮（日付/スタッフ名/新規人数/既存人数/技術売上/オプション売上/物販売上/合計）。
//       税理士指定の項目を受領したらこのファイルの rows 部分を差し替える。

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return new NextResponse("期間の指定が正しくありません", { status: 400 });
  }

  const db = getDataStore();
  const [reports, staffList] = await Promise.all([
    db.listDailyReports({ from, to }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  const rows: (string | number)[][] = [
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

  const filename = `eryes_sales_${from.replaceAll("-", "")}-${to.replaceAll("-", "")}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
