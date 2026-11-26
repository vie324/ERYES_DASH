// 依頼17：稼働率・巻いた時間・オーバー時間を毎日出す（ENi・イーリス）。計算式はこのファイルの1か所にまとめる。
//
//  ・ENi …… 稼働率 ＝ 入客時間 ÷（枠数＝段数 × 8時間）。8月に決めた式で、今のコード（lib/eni/forms.ts の
//            utilizationOf・capacityMinutes）と同じ。日報に入れた入客時間で計算する
//  ・イーリス … 稼働率 ＝ 施術時間 ÷（シフトの時間 − 休憩）。シフトは依頼12のデータ（公開中のシフト／いつもどおりの予定）。
//            休憩は、勤務パターンの休憩 → 入力した休憩 → 初期値（管理画面）の順
//  ・巻いた時間・オーバー時間 …… 施術ごとに「予定の所要時間 − 実際にかかった時間」。プラスなら巻いた、マイナスならオーバー。
//            SalonOne から施術ごとの時間が取れるまでは「データなし」
// サロンボードには外からつなぐ仕組み（API）が無いので、つながない。2027年1月から SalonOne の API で取り込む（lib/salonone.ts）。
// 取り込みは毎日の定期実行（lib/jobs）。取り込めなかった日（データが無い日）には印（missing）をつけ、手で直せる（manual）。

import { fx } from "@/lib/data/tables";
import type { UtilizationDaily } from "@/lib/data/tables";
import { capacityMinutes, utilizationOf } from "@/lib/eni/forms";
import { addDays, datesOfMonth, monthRange, todayJst } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { loadMonthSchedule } from "@/lib/shift/load";
import { listShiftTemplates } from "@/lib/shift/extras";
import { fetchProcedures, isSalonOneConfigured } from "@/lib/salonone";
import { isEyesStore } from "@/lib/viewer";
import type { DataStore, Staff } from "@/lib/data/types";

export const UTILIZATION_SETTINGS_KEY = "utilization_settings";
export interface UtilizationSettings {
  /** イーリスの休憩の初期値（分）。勤務パターンにも入力にも無いとき */
  eyesBreakMinutes: number;
  /** 稼働率の目安（色分け）：これ以上はよい */
  goodRate: number;
  /** これ未満は注意 */
  lowRate: number;
}
export const DEFAULT_UTILIZATION_SETTINGS: UtilizationSettings = { eyesBreakMinutes: 60, goodRate: 70, lowRate: 40 };
export async function getUtilizationSettings(db: DataStore): Promise<UtilizationSettings> {
  return readJsonSetting(db, UTILIZATION_SETTINGS_KEY, DEFAULT_UTILIZATION_SETTINGS);
}

/** 管理画面・本人の画面に出す計算式の説明 */
export const DEFINITIONS = [
  { brand: "ENi", formula: "稼働率 ＝ 入客時間 ÷（枠数〈段数〉× 8時間）", note: "8月に決めた式。日報の「入客時間」で計算。段数はマスタ設定のスタッフの段数" },
  { brand: "イーリス", formula: "稼働率 ＝ 施術時間 ÷（シフトの時間 − 休憩）", note: "シフトは依頼12のデータ。休憩は勤務パターン → 入力 → 初期値の順" },
  { brand: "共通", formula: "巻いた時間／オーバー時間 ＝ 予定の所要時間 − 実際にかかった時間（施術ごと）", note: "プラス＝巻いた、マイナス＝オーバー。SalonOne から施術の時間が取れるまでは「データなし」" },
];

function minutesBetween(start: string, end: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export function rateOf(served: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((served / capacity) * 1000) / 10;
}

/** 施術ごとの「予定 − 実際」を、巻いた（プラス）とオーバー（マイナス）に分けて合計する */
export function aheadOver(procedures: { plannedMinutes: number; actualMinutes: number | null }[]): { ahead: number; over: number; counted: number } {
  let ahead = 0;
  let over = 0;
  let counted = 0;
  for (const p of procedures) {
    if (p.actualMinutes === null) continue;
    counted++;
    const d = p.plannedMinutes - p.actualMinutes;
    if (d > 0) ahead += d;
    else over += -d;
  }
  return { ahead, over, counted };
}

/**
 * その日の稼働率を作り直す（手で直した日は変えない）。
 * 対象：ENiのスタイリスト／イーリスのスタッフ（職種なし）。出勤の予定の日だけ。
 */
export async function computeUtilizationForDate(db: DataStore, date: string): Promise<{ saved: number; missing: number }> {
  const f = fx();
  const [staffList, stores, settings, templates, loaded, reports, inputs, existing] = await Promise.all([
    db.listStaff(),
    db.listStores(),
    getUtilizationSettings(db),
    listShiftTemplates().catch(() => []),
    loadMonthSchedule(db, date.slice(0, 7), false),
    db.listEniReports("stylist", { from: date, to: date }),
    f.utilizationInputs.list({ where: { date } }),
    f.utilizationDaily.list({ where: { date } }),
  ]);
  const procedures = isSalonOneConfigured() ? await fetchProcedures(date) : null;
  let saved = 0;
  let missing = 0;
  for (const s of staffList.filter((x) => x.isActive && x.role !== "admin")) {
    const store = stores.find((x) => x.id === s.storeId);
    const eyes = isEyesStore(store);
    if (!eyes && s.jobType !== "stylist") continue;
    const cell = loaded.schedule.cell(s.id, date);
    const prev = existing.find((e) => e.staffId === s.id);
    if (prev?.status === "manual") continue;
    const mine = procedures?.filter((p) => p.staffId === s.id) ?? [];
    const report = reports.find((r) => r.staffId === s.id);
    const input = inputs.find((i) => i.staffId === s.id);
    if (!cell.working && !report && !input && mine.length === 0) {
      if (prev) await f.utilizationDaily.remove(prev.id);
      continue;
    }
    let served = 0;
    let capacity = 0;
    let source: UtilizationDaily["source"] = "none";
    if (mine.length > 0) {
      served = mine.reduce((sum, p) => sum + (p.actualMinutes ?? p.plannedMinutes), 0);
      source = "salonone";
    }
    if (eyes) {
      const shiftMinutes = minutesBetween(cell.startTime, cell.endTime);
      const template = templates.find((t) => t.startTime === cell.startTime && t.endTime === cell.endTime);
      const breakMinutes = template?.breakMinutes ?? input?.breakMinutes ?? settings.eyesBreakMinutes;
      capacity = Math.max(0, shiftMinutes - breakMinutes);
      if (source === "none" && input) {
        served = input.servedMinutes;
        source = "manual";
      }
    } else {
      capacity = capacityMinutes(s.tiers);
      if (source === "none" && report && typeof report.answers.service_minutes === "number") {
        served = report.answers.service_minutes;
        source = "report";
      }
    }
    const ao = aheadOver(mine);
    const hasData = source !== "none" && capacity > 0;
    const row = {
      staffId: s.id,
      date,
      storeId: cell.storeId || s.storeId,
      brand: (eyes ? "eyes" : "eni") as "eni" | "eyes",
      servedMinutes: served,
      capacityMinutes: capacity,
      // ENiは今の日報の計算（utilizationOf）にそろえる
      rate: hasData ? (!eyes && report && source === "report" ? (utilizationOf(report.answers, s.tiers) ?? rateOf(served, capacity)) : rateOf(served, capacity)) : 0,
      aheadMinutes: ao.ahead,
      overMinutes: ao.over,
      procedureCount: ao.counted,
      source,
      status: (hasData ? "ok" : "missing") as UtilizationDaily["status"],
      note: hasData ? "" : eyes && capacity <= 0 ? "シフトの時間が無い" : "入客時間（施術時間）の入力が無い",
      computedAt: new Date(),
    };
    if (prev) await f.utilizationDaily.update(prev.id, row);
    else await f.utilizationDaily.insert(row);
    saved++;
    if (!hasData) missing++;
  }
  return { saved, missing };
}

/** 毎日の定期実行：きのうの分と、直近7日（あとから日報を入れた分）を作り直す */
export async function utilizationJob(db: DataStore, today: string): Promise<string> {
  let saved = 0;
  let missing = 0;
  const f = fx();
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, -i);
    const r = await computeUtilizationForDate(db, date);
    saved += r.saved;
    if (i === 1) missing = r.missing;
    if (!(await f.jobRuns.find({ jobKey: "utilization_day", runKey: date }))) {
      await f.jobRuns.insert({ jobKey: "utilization_day", runKey: date, status: "done", detail: "毎日の定期実行" });
    }
  }
  return `${saved}件を作り直し（きのうのデータなし ${missing}件）`;
}

export interface MonthUtil {
  staffId: string;
  days: UtilizationDaily[];
  /** 月の稼働率（日ごとの平均ではなく、合計の割合） */
  rate: number | null;
  served: number;
  capacity: number;
  ahead: number;
  over: number;
  missingDays: number;
}

export async function monthUtilization(month: string, staffIds?: string[]): Promise<MonthUtil[]> {
  const { from, to } = monthRange(month);
  const rows = await fx().utilizationDaily.list({
    where: { date: { gte: from, lte: to }, ...(staffIds ? { staffId: { in: staffIds } } : {}) },
    order: [["date", "asc"]],
  });
  const by = new Map<string, UtilizationDaily[]>();
  for (const r of rows) by.set(r.staffId, [...(by.get(r.staffId) ?? []), r]);
  return [...by.entries()].map(([staffId, days]) => {
    const ok = days.filter((d) => d.status === "ok" || d.status === "manual");
    const served = ok.reduce((s, d) => s + d.servedMinutes, 0);
    const capacity = ok.reduce((s, d) => s + d.capacityMinutes, 0);
    return {
      staffId,
      days,
      rate: capacity > 0 ? rateOf(served, capacity) : null,
      served,
      capacity,
      ahead: days.reduce((s, d) => s + d.aheadMinutes, 0),
      over: days.reduce((s, d) => s + d.overMinutes, 0),
      missingDays: days.filter((d) => d.status === "missing").length,
    };
  });
}

/**
 * 画面を開いたとき、まだ作っていない日（定期実行の前・デモ）があれば作る（今日は除く）。
 * 作った日は job_runs に印を残し、2回目からは作り直さない（作り直しは毎日の定期実行で）。
 */
export async function ensureMonthComputed(db: DataStore, month: string): Promise<void> {
  const today = todayJst();
  const dates = datesOfMonth(month).filter((d) => d < today);
  if (dates.length === 0) return;
  const f = fx();
  const done = new Set((await f.jobRuns.list({ where: { jobKey: "utilization_day", runKey: { in: dates } } })).map((r) => r.runKey));
  for (const d of dates.filter((x) => !done.has(x)).slice(-31)) {
    await computeUtilizationForDate(db, d);
    await f.jobRuns.insert({ jobKey: "utilization_day", runKey: d, status: "done", detail: "画面を開いたときに作成" });
  }
}

export function isUtilTarget(s: Staff, eyes: boolean): boolean {
  return s.isActive && s.role !== "admin" && (eyes || s.jobType === "stylist");
}
