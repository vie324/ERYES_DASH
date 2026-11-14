// 朝の画面の「今日のタスク」。
// 本人の今日のルーティン・期限が近いタスク・未読から、今日やることを3つほど短く出す。
//  ・AIしもんと同じ Claude APIキー（ANTHROPIC_API_KEY）を使い、1人1日1回だけ作って保存する（開くたびには作らない）
//  ・AIが使えないとき（キー未設定・失敗・お断り）は、普通の一覧で出す
//  ・AIに渡すのは本人のタスク情報だけ。ほかの人の名前（依頼した人・トークの相手など）やトークの中身は渡さない

import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "@/lib/env";
import { addDays, formatDateJa, weekStartOf } from "@/lib/date";
import { getChatOverview } from "@/lib/chat";
import { getMyTaskSummary, isTaskDueOn, type MyTaskSummary } from "@/lib/tasks";
import type { DailyBrief, DailyBriefItem, DataStore, Staff } from "@/lib/data/types";

/** AIに渡す材料（本人のタスク情報だけ） */
export interface BriefSource {
  today: string;
  /** 今日やる日で、まだ完了していないルーティン */
  routines: string[];
  /** スタイリストの毎日の業務で、まだのもの */
  dailyItems: string[];
  /** 期限切れ・3日以内が期限のタスク（1回きり） */
  tasks: { title: string; due: string; overdue: boolean }[];
  /** 会社のタスク（日報・週報・今日の予定の未入力など） */
  companyTodo: string[];
  /** 未読のトークの件数（相手の名前・中身は渡さない） */
  unread: number;
}

/** 本人の情報から材料を作る（ほかの人の情報は入れない） */
export function buildBriefSource(input: {
  today: string;
  summary: MyTaskSummary;
  unread: number;
  companyTodo: string[];
}): BriefSource {
  const { today, summary } = input;
  const soon = addDays(today, 3);
  const routines = summary.tasks
    .filter((t) => t.taskType === "routine" && isTaskDueOn(t, today) && !summary.doneTodayIds.has(t.id))
    .map((t) => t.title);
  const tasks = summary.tasks
    .filter((t) => t.taskType === "task" && t.status !== "done" && t.dueDate && t.dueDate <= soon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((t) => ({ title: t.title, due: t.dueDate, overdue: t.dueDate < today }));
  return {
    today,
    routines,
    dailyItems: summary.dailyItems.filter((s) => !s.done).map((s) => s.routine.title),
    tasks,
    companyTodo: input.companyTodo,
    unread: input.unread,
  };
}

/** AIが使えないときの普通の一覧（期限切れ → 会社のタスク → 今日のルーティン → 期限が近い → 未読 の順に3つまで） */
export function fallbackBriefItems(src: BriefSource): DailyBriefItem[] {
  const items: DailyBriefItem[] = [];
  for (const t of src.tasks.filter((t) => t.overdue)) items.push({ text: t.title, detail: `期限切れ（${formatDateJa(t.due)}）` });
  for (const c of src.companyTodo) items.push({ text: c, detail: "会社のタスク" });
  for (const r of src.routines) items.push({ text: r, detail: "今日のルーティン" });
  for (const d of src.dailyItems) items.push({ text: d, detail: "毎日の業務" });
  for (const t of src.tasks.filter((t) => !t.overdue)) items.push({ text: t.title, detail: `期限 ${formatDateJa(t.due)}` });
  if (src.unread > 0) items.push({ text: "未読のトークを確認する", detail: `${src.unread}件` });
  return items.slice(0, 3);
}

/** 材料が空か（やることが何もない日はAIを呼ばない） */
export function isEmptySource(src: BriefSource): boolean {
  return (
    src.routines.length === 0 &&
    src.dailyItems.length === 0 &&
    src.tasks.length === 0 &&
    src.companyTodo.length === 0 &&
    src.unread === 0
  );
}

const SYSTEM_PROMPT = `あなたは美容室「ENi」のスタッフの、朝のアシスタントです。
渡された本人のタスク情報だけを見て、今日いちばん先にやるべきことを3つほど選び、短い日本語で書きます。
- 1つは20文字前後。「〜する」で終わる、具体的な行動にする
- 期限切れ → 会社のタスク（日報・週報・予定の入力） → 今日のルーティン・毎日の業務 → 期限が近いタスク → 未読の確認 の順に大事
- 渡された情報にないタスクを作らない。人の名前を新しく書き足さない
- detail には、なぜ今日なのかをひとことで（例「期限切れ」「今日のルーティン」）。無ければ空文字`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "今日やること（3つほど）",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "やること（20文字前後・〜する）" },
          detail: { type: "string", description: "ひとことの理由。無ければ空文字" },
        },
        required: ["text", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** 材料をAIに渡す文にする（本人の情報だけ） */
export function briefPrompt(src: BriefSource): string {
  const lines = [`今日：${src.today}`];
  if (src.tasks.length > 0) {
    lines.push("期限が近い・過ぎたタスク：");
    for (const t of src.tasks) lines.push(`- ${t.title}（期限 ${t.due}${t.overdue ? "・期限切れ" : ""}）`);
  }
  if (src.companyTodo.length > 0) lines.push(`会社のタスク：${src.companyTodo.join("／")}`);
  if (src.routines.length > 0) lines.push(`今日のルーティン：${src.routines.join("／")}`);
  if (src.dailyItems.length > 0) lines.push(`毎日の業務（まだ）：${src.dailyItems.join("／")}`);
  lines.push(`未読のトーク：${src.unread}件`);
  return lines.join("\n");
}

/**
 * Claude で今日のタスクを作る。失敗・お断りのときは null（呼び出し側で普通の一覧に戻す）。
 * モデルは HOME_BRIEF_MODEL（未設定なら ANTHROPIC_MODEL と同じ）。短い仕事なので effort は low。
 * お断り（refusal）になったときは、サーバー側の fallbacks で別のモデルが続ける。
 */
export async function generateBriefItems(src: BriefSource): Promise<{ items: DailyBriefItem[]; model: string } | null> {
  if (!isAnthropicConfigured()) return null;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.beta.messages.create({
      model: env.homeBriefModel || env.anthropicModel,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: briefPrompt(src) }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error(`[home-brief] 今日のタスクを作れませんでした: stop_reason=${response.stop_reason}`);
      return null;
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const parsed = JSON.parse(text) as { items?: unknown };
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((i) => {
        const r = (i ?? {}) as Record<string, unknown>;
        return { text: String(r.text ?? "").trim().slice(0, 60), detail: String(r.detail ?? "").trim().slice(0, 40) };
      })
      .filter((i) => i.text)
      .slice(0, 3);
    if (items.length === 0) return null;
    return { items, model: response.model };
  } catch (e) {
    console.error("[home-brief] 今日のタスクの作成でエラー:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 会社のタスク（ENi）：今日の日報・今週の週報・今日の予定の未入力 */
async function companyTodoOf(db: DataStore, me: Staff, today: string): Promise<string[]> {
  const todo: string[] = [];
  const [stylist, weekly, plan] = await Promise.all([
    me.jobType !== "assistant" && me.jobType !== "" ? db.getEniReport("stylist", me.id, today) : Promise.resolve(undefined),
    me.jobType === "assistant" ? db.getEniReport("weekly", me.id, weekStartOf(today)) : Promise.resolve(undefined),
    me.jobType !== "" ? db.listDailyPlans(today).then((p) => p.find((x) => x.staffId === me.id) ?? null) : Promise.resolve(undefined),
  ]);
  if (stylist === null) todo.push("今日の日報を入力する");
  if (weekly === null) todo.push("今週の週報を入力する");
  if (plan === null) todo.push("今日の予定を入力する");
  return todo;
}

/**
 * 今日のタスク（1人1日1回だけ作って保存）。
 * 保存済みならそれを返す。まだなら作って保存する（AIを使えるときは、失敗しても普通の一覧を保存して、その日はもう作らない）。
 * AIキーが未設定のときは保存せず、その場の普通の一覧を返す。
 */
export async function getTodayBrief(db: DataStore, staffId: string, today: string): Promise<DailyBrief> {
  const saved = await db.getDailyBrief(staffId, today);
  if (saved) return saved;

  const me = await db.getStaff(staffId);
  const [summary, chat, companyTodo] = await Promise.all([
    getMyTaskSummary(db, staffId, today),
    getChatOverview(db, staffId),
    me ? companyTodoOf(db, me, today) : Promise.resolve([]),
  ]);
  const src = buildBriefSource({ today, summary, unread: chat.totalUnread, companyTodo });
  const fallback = fallbackBriefItems(src);
  if (!isAnthropicConfigured()) {
    return { staffId, date: today, items: fallback, ai: false, model: "", createdAt: new Date() };
  }

  const generated = isEmptySource(src) ? null : await generateBriefItems(src);
  const brief = {
    staffId,
    date: today,
    items: generated?.items ?? fallback,
    ai: Boolean(generated),
    model: generated?.model ?? "",
  };
  await db.saveDailyBrief(brief);
  // 同時に作られた場合も、先に保存された方にそろえる
  return (await db.getDailyBrief(staffId, today)) ?? { ...brief, createdAt: new Date() };
}
