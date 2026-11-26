// 依頼12：月の勤務時間のCSV（給与計算用。管理者だけ）。Excelでそのまま開ける（UTF-8 BOM付き）。
//  ・type=summary …… 人ごとの月の集計（出勤日数・勤務・休憩・実働・遅刻・早退・シフト外・打刻なし）
//  ・type=daily ……… 人ごと・日ごとの記録（予定・出勤・退勤・実働・印）

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { minutesLabel, monthAttendanceRecords, toCsv, totalsOf } from "@/lib/attendance-shift";
import { formatTimeJa, thisMonthJst } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "管理者だけが使えます" }, { status: 403 });
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("month") ?? "") ? req.nextUrl.searchParams.get("month")! : thisMonthJst();
  const type = req.nextUrl.searchParams.get("type") === "daily" ? "daily" : "summary";
  const db = getDataStore();
  const [staff, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const active = staff.filter((s) => s.isActive);
  const records = await monthAttendanceRecords(db, month, { staffIds: active.map((s) => s.id) });
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";
  let rows: (string | number)[][];
  if (type === "summary") {
    rows = [["名前", "所属店舗", "出勤日数", "勤務時間", "休憩", "実働", "実働（分）", "遅刻（回）", "早退（回）", "シフト外（回）", "打刻なし（日）"]];
    for (const s of active) {
      const t = totalsOf(records.get(s.id) ?? []);
      rows.push([s.name, storeName(s.storeId), t.workDays, minutesLabel(t.workMinutes), minutesLabel(t.breakMinutes), minutesLabel(t.netMinutes), t.netMinutes, t.lateCount, t.earlyCount, t.offShiftCount, t.missingCount]);
    }
  } else {
    rows = [["名前", "日付", "予定の店舗", "予定（開始）", "予定（終了）", "出勤", "退勤", "勤務（分）", "休憩（分）", "実働（分）", "遅刻（分）", "早退（分）", "シフト外", "打刻なし", "修正あり"]];
    for (const s of active) {
      for (const d of records.get(s.id) ?? []) {
        if (!d.planned.working && !d.inAt && !d.outAt) continue;
        rows.push([
          s.name,
          d.date,
          d.planned.working ? storeName(d.planned.storeId) : "",
          d.planned.working ? d.planned.start : "休み",
          d.planned.working ? d.planned.end : "",
          d.inAt ? formatTimeJa(d.inAt) : "",
          d.outAt ? formatTimeJa(d.outAt) : "",
          d.workMinutes,
          d.breakMinutes,
          d.netMinutes,
          d.late ? d.lateMinutes : 0,
          d.early ? d.earlyMinutes : 0,
          d.offShift ? "○" : "",
          d.missing ? "○" : "",
          d.inCorrected || d.outCorrected ? "○" : "",
        ]);
      }
    }
  }
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`勤務時間_${month}_${type === "summary" ? "集計" : "日別"}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
