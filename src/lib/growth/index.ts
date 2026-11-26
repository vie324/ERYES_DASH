// 依頼20（74）：カリキュラム・コンピテンシー・成長ロードマップを、アプリの中で1本の時間軸で見せる。
//  ・成長の段階（growth_stages）＝ 入社から何か月でどこまで（成長ロードマップ）＋ その段階で求める行動・技術（コンピテンシー）
//  ・カリキュラムの項目（curriculum_items）＝ 段階ごとの合格する項目（動画・練習時間の目安つき）。合格の判定は幹部が入れる
//  ・本人の画面：入社からの時間軸の上に、合格したカリキュラム・今の段階・次の目標と目安の時期・練習時間を並べる。
//    予定より遅れていれば分かるようにする
//  ・中身はENiの資料から入れる前提で、管理画面（/admin/growth）で編集する（元の資料はTODO）
// 入社日は staff には列を足さず、staff_profiles に持つ。

import { fx } from "@/lib/data/tables";
import type { CurriculumItem, CurriculumResult, GrowthStage } from "@/lib/data/tables";
import { addMonths, monthRange, todayJst } from "@/lib/date";
import type { DataStore, Staff } from "@/lib/data/types";

export interface StageProgress {
  stage: GrowthStage;
  items: (CurriculumItem & { result: CurriculumResult | null })[];
  passed: number;
  total: number;
  /** 目安の時期（入社日 ＋ 目安の月数）"YYYY-MM" */
  targetMonth: string | null;
  done: boolean;
  /** 目安の時期を過ぎても終わっていない */
  late: boolean;
}

export interface GrowthTimeline {
  joinedOn: string;
  monthsSinceJoin: number | null;
  stages: StageProgress[];
  current: StageProgress | null;
  next: StageProgress | null;
  practiceByMonth: { month: string; minutes: number }[];
}

export function monthsBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/**
 * その人の段階。段階の「対象」は 全員（空）／stylist／assistant／eyes（イーリスの店舗の人）。
 * ENiで職種が未設定の人には、ENiの段階をすべて出す（メニューと同じ決まり）。
 */
export async function stagesFor(jobType: string, isEyes: boolean): Promise<GrowthStage[]> {
  const all = await fx().growthStages.list({ where: { isActive: true }, order: [["sortOrder", "asc"], ["targetMonth", "asc"]] });
  return all.filter((s) => !s.jobType || (s.jobType === "eyes" ? isEyes : !isEyes && (!jobType || s.jobType === jobType)));
}

export async function joinedOnOf(staffId: string): Promise<string> {
  return (await fx().staffProfiles.find({ staffId }))?.joinedOn ?? "";
}

/** 1人の時間軸 */
export async function growthTimeline(db: DataStore, staff: Staff): Promise<GrowthTimeline> {
  const f = fx();
  const today = todayJst();
  const store = (await db.listStores()).find((s) => s.id === staff.storeId);
  const isEyes = /EREYS|イーリス/i.test(store?.name ?? "");
  const [stages, joinedOn, results, items] = await Promise.all([
    stagesFor(staff.jobType, isEyes),
    joinedOnOf(staff.id),
    f.curriculumResults.list({ where: { staffId: staff.id }, order: [["judgedAt", "desc"]] }),
    f.curriculumItems.list({ where: { isActive: true }, order: [["sortOrder", "asc"]] }),
  ]);
  const progress: StageProgress[] = stages.map((stage) => {
    const mine = items
      .filter((i) => i.stageId === stage.id)
      .map((i) => ({ ...i, result: results.find((r) => r.itemId === i.id) ?? null }));
    const passed = mine.filter((i) => i.result?.status === "passed").length;
    const targetMonth = joinedOn ? addMonths(joinedOn.slice(0, 7), stage.targetMonth) : null;
    const done = mine.length > 0 && passed === mine.length;
    return { stage, items: mine, passed, total: mine.length, targetMonth, done, late: Boolean(targetMonth && !done && today.slice(0, 7) > targetMonth) };
  });
  const firstOpen = progress.findIndex((p) => !p.done);
  const current = firstOpen > 0 ? progress[firstOpen - 1] : firstOpen === -1 ? (progress[progress.length - 1] ?? null) : null;
  const next = firstOpen >= 0 ? progress[firstOpen] : null;
  const months = Array.from({ length: 6 }, (_, i) => addMonths(today.slice(0, 7), i - 5));
  const records = await db.listPracticeRecords({ staffId: staff.id, from: monthRange(months[0]).from, to: today });
  return {
    joinedOn,
    monthsSinceJoin: joinedOn ? Math.max(0, monthsBetween(joinedOn, today)) : null,
    stages: progress,
    current,
    next,
    practiceByMonth: months.map((m) => ({ month: m, minutes: records.filter((r) => r.practiceDate.startsWith(m)).reduce((s, r) => s + r.minutes, 0) })),
  };
}

/** 動画をどこまで見たか（人×動画 → 0〜100） */
export async function videoProgressFor(staffId: string): Promise<Map<string, { pct: number; completed: boolean }>> {
  const rows = await fx().videoProgress.list({ where: { staffId } });
  return new Map(rows.map((r) => [r.videoId, { pct: r.durationSec > 0 ? Math.min(100, Math.round((r.maxPositionSec / r.durationSec) * 100)) : 0, completed: r.completed }]));
}
