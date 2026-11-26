// 依頼14：インセンティブに使うデータのCSV（管理者だけ）

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { toCsv } from "@/lib/attendance-shift";
import { addMonths, thisMonthJst } from "@/lib/date";
import { incentiveReport, STATUS_LABEL } from "@/lib/required-inputs/incentive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "管理者だけが使えます" }, { status: 403 });
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : addMonths(thisMonthJst(), -1);
  const db = getDataStore();
  const [{ summaries }, staff] = await Promise.all([incentiveReport(db, month), db.listStaff()]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "";
  const rows: (string | number)[][] = [["名前", "日付", "入力", "状態", "売上（使う分）"]];
  for (const s of summaries) {
    for (const i of s.items) {
      rows.push([nameOf(s.staffId), i.date, i.label, STATUS_LABEL[i.status], i.status === "ontime" || i.status === "rescued" ? i.sales : 0]);
    }
  }
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`インセンティブ_${month}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
