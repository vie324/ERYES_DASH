// 定時実行の仕事（毎月1日の表彰の集計・毎晩の稼働率の取り込み・発注リスト・未入力の通知など）を1か所で回す。
// vercel.json に /api/cron/daily を日本時間の何時かに1日1回ずつ登録し、その回で「やる時刻を過ぎた仕事」だけを行う
// （Vercelの無料プランは1つの定時実行が1日1回のため、毎朝のリマインドと同じ考え方）。
// 同じ仕事を同じ日（月・週）に2回しないよう、job_runs に「仕事×回」の行を残す。

import { fx } from "@/lib/data/tables";
import type { DataStore } from "@/lib/data/types";

export interface JobContext {
  db: DataStore;
  now: Date;
  /** 今日（JST） "YYYY-MM-DD" */
  today: string;
  /** この回の日本時間の「時」 */
  slotHour: number;
  /** 管理画面の「今すぐ実行」など、時刻の判定を飛ばすとき */
  force: boolean;
}

export interface JobDef {
  key: string;
  label: string;
  /** いつやるかの説明（管理画面に出す） */
  when: string;
  /** この回にやるか */
  due: (ctx: JobContext) => Promise<boolean> | boolean;
  /** 「何の分か」（日付・月・週）。同じキーでは1回しかやらない */
  runKey: (ctx: JobContext) => string;
  /** 実際の仕事。結果のひとこと（件数など）を返す */
  run: (ctx: JobContext) => Promise<string>;
}

export interface JobOutcome {
  key: string;
  label: string;
  status: "done" | "skipped" | "error";
  detail: string;
}

/** 1つの仕事を回す（同じ回にすでにやっていれば何もしない。force でも、回が同じなら二重には通知しない） */
export async function runJob(job: JobDef, ctx: JobContext, opts: { ignoreRunKey?: boolean } = {}): Promise<JobOutcome> {
  const base = { key: job.key, label: job.label };
  try {
    if (!ctx.force && !(await job.due(ctx))) return { ...base, status: "skipped", detail: "この回ではありません" };
    const runKey = opts.ignoreRunKey ? `${job.runKey(ctx)}#manual-${ctx.now.getTime()}` : job.runKey(ctx);
    const db = fx();
    if (await db.jobRuns.find({ jobKey: job.key, runKey })) {
      return { ...base, status: "skipped", detail: `実行済み（${runKey}）` };
    }
    const row = await db.jobRuns.insert({ jobKey: job.key, runKey, status: "running", detail: "" });
    try {
      const detail = await job.run(ctx);
      await db.jobRuns.update(row.id, { status: "done", detail: detail.slice(0, 500) });
      return { ...base, status: "done", detail };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.jobRuns.update(row.id, { status: "error", detail: message.slice(0, 500) });
      return { ...base, status: "error", detail: message };
    }
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function runJobs(jobs: JobDef[], ctx: JobContext): Promise<JobOutcome[]> {
  const out: JobOutcome[] = [];
  // 順番に回す（同時に回すとDBの同時接続が増え、通知も重なるため）
  for (const job of jobs) out.push(await runJob(job, ctx));
  return out;
}

/** 「毎日◯時以降の最初の回」にやる仕事の判定 */
export function dailyAt(hour: number): (ctx: JobContext) => boolean {
  return (ctx) => ctx.slotHour >= hour;
}
