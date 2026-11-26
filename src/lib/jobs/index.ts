// 依頼10〜23の定時実行の仕事の一覧（/api/cron/daily がこの順に回す）。
// 「何時以降の最初の回」にやる（dailyAt）。同じ日（月）には1回だけ（job_runs）。管理画面の「今すぐ実行」からも回せる。

import { dailyAt, type JobDef } from "./runner";
import { monthlyAwardJob } from "@/lib/sns/award";
import { incentiveReminderJob, requiredInputsDue, requiredInputsNotifyJob } from "@/lib/required-inputs/jobs";
import { reorderNotifyJob } from "@/lib/inventory/jobs";
import { getInventorySettings } from "@/lib/inventory";
import { utilizationJob } from "@/lib/utilization";
import { feedbackReminderJob, goalSuggestJob } from "@/lib/goals/jobs";
import { instagramSyncJob } from "@/lib/instagram";
import { recordingPurgeJob } from "@/lib/recruit";

const byDay = (c: { today: string }) => c.today;

export const JOBS: JobDef[] = [
  { key: "utilization", label: "稼働率の計算（依頼17）", when: "毎日 3時（きのうと直近7日）", due: dailyAt(3), runKey: byDay, run: (c) => utilizationJob(c.db, c.today) },
  { key: "recording_purge", label: "面接の録画の自動削除（依頼23）", when: "毎日 3時", due: dailyAt(3), runKey: byDay, run: (c) => recordingPurgeJob(c.db, c.today) },
  { key: "instagram_sync", label: "Instagramの数字を集める（依頼22）", when: "毎日 5時（前の日の分）", due: dailyAt(5), runKey: byDay, run: (c) => instagramSyncJob(c.db, c.today) },
  {
    key: "monthly_award",
    label: "月間サンクス表彰の集計（依頼10）",
    when: "毎月1日 7時（前の月の分）",
    due: (c) => c.today.endsWith("-01") && c.slotHour >= 7,
    runKey: (c) => c.today.slice(0, 7),
    run: (c) => monthlyAwardJob(c.db, c.today),
  },
  { key: "goal_suggest", label: "AIの今週・今月やること（依頼19）", when: "月曜と毎月1日 7時", due: dailyAt(7), runKey: byDay, run: goalSuggestJob },
  {
    key: "reorder_notify",
    label: "発注が必要な商品の通知（依頼18）",
    when: "毎日（在庫の設定の時刻。初期値10時）",
    due: async (c) => c.slotHour >= (await getInventorySettings(c.db)).notifyHour,
    runKey: byDay,
    run: reorderNotifyJob,
  },
  { key: "incentive_reminder", label: "インセンティブの締め日の通知（依頼14）", when: "毎日 9時（締め日の3日前から）", due: dailyAt(9), runKey: byDay, run: incentiveReminderJob },
  { key: "feedback_reminder", label: "振り返りに返していない幹部への通知（依頼19）", when: "水曜 12時（目標の設定の曜日）", due: dailyAt(12), runKey: byDay, run: feedbackReminderJob },
  { key: "required_inputs", label: "まだの入力の通知（依頼14）", when: "毎日 閉店後（必須入力の設定の時刻。初期値19時）", due: requiredInputsDue, runKey: byDay, run: requiredInputsNotifyJob },
];

export function jobByKey(key: string): JobDef | undefined {
  return JOBS.find((j) => j.key === key);
}
