// 依頼15：ウィッグ・社販の購入の月の明細と人ごとの合計（管理者だけ）。Excelで開ける。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { toCsv } from "@/lib/attendance-shift";
import { thisMonthJst } from "@/lib/date";
import { purchaseSummary } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "管理者だけが使えます" }, { status: 403 });
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : thisMonthJst();
  const [{ rows, byStaff }, staff] = await Promise.all([purchaseSummary(month), getDataStore().listStaff()]);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "";
  const out: (string | number)[][] = [["名前", "合計（円）", "点数"]];
  for (const [id, v] of byStaff) out.push([nameOf(id), v.total, v.count]);
  out.push([], ["日付", "名前", "種類", "品名", "数", "1つの値段", "金額"]);
  for (const r of rows) out.push([r.purchasedOn, nameOf(r.staffId), r.category === "wig" ? "ウィッグ" : "社販", r.itemName, r.quantity, r.unitPrice, r.total]);
  return new NextResponse(toCsv(out), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`ウィッグ・社販_${month}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
