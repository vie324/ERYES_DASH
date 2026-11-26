// 追加したAIの機能（Wiki検索・今週やること など）の共通の呼び出し口。CLAUDE.md「AIを使う機能」の決まりをここで守る。
//  ・キーとモデルは環境変数（ANTHROPIC_API_KEY・AIしもんと同じモデル。AI_TOOLS_MODEL で変えられる）。サーバー側だけで使う
//  ・送る前に、電話番号・メールアドレスのような個人情報を伏せる（maskPersonalInfo）
//  ・同じ材料の結果は ai_cache に保存して使い回す（cacheKey）
//  ・1人・1日あたりの上限（管理画面で変える。ai_limits）を超えたら呼ばない
//  ・使ったトークン数を ai_usage_logs に記録する（管理画面で月ごとに見る）
//  ・失敗・お断り・上限のときは ok:false を返す（呼び出し側はAIなしの表示に切り替える）

import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "@/lib/env";
import { fx } from "@/lib/data/tables";
import { jstDayBoundsUtc, todayJst } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import type { DataStore } from "@/lib/data/types";

/** AIを使う機能（使用量の集計・上限の単位） */
export type AiFeature = "ai_shimon" | "wiki_search" | "goal_suggest" | "minutes" | "home_brief";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  ai_shimon: "AIしもん（相談）",
  wiki_search: "ENi Wikipedia のAI検索",
  goal_suggest: "目標：今週・今月やること",
  minutes: "議事録のAI整形",
  home_brief: "ホームの今日のタスク",
};

export const AI_LIMITS_KEY = "ai_limits";
/** 1人・1日あたりの回数の上限（0＝上限なし）。管理画面（/admin/ai-usage）で変える */
export const DEFAULT_AI_LIMITS: Record<AiFeature, number> = {
  ai_shimon: 60,
  wiki_search: 30,
  goal_suggest: 4,
  minutes: 20,
  home_brief: 2,
};

export async function getAiLimits(db: DataStore): Promise<Record<AiFeature, number>> {
  return readJsonSetting(db, AI_LIMITS_KEY, DEFAULT_AI_LIMITS);
}

/** 電話番号・メールアドレス・郵便番号らしきものを伏せる（AIに送る前に必ず通す） */
export function maskPersonalInfo(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "［メール］")
    .replace(/(?:\+81[-\s]?|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, "［電話番号］")
    .replace(/〒?\d{3}-\d{4}/g, "［郵便番号］");
}

/** 材料から作るキャッシュのキー（同じ材料なら同じキー） */
export function cacheKeyOf(feature: string, ...parts: string[]): string {
  return `${feature}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40)}`;
}

/** 使った量を記録する（失敗しても呼び出し元は止めない） */
export async function logAiUsage(input: {
  feature: AiFeature;
  staffId: string | null;
  model: string;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  ok: boolean;
  note?: string;
}): Promise<void> {
  try {
    await fx().aiUsageLogs.insert({
      feature: input.feature,
      staffId: input.staffId,
      model: input.model,
      inputTokens: input.usage?.input_tokens ?? 0,
      outputTokens: input.usage?.output_tokens ?? 0,
      cacheReadTokens: input.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: input.usage?.cache_creation_input_tokens ?? 0,
      ok: input.ok,
      note: (input.note ?? "").slice(0, 200),
    });
  } catch (e) {
    console.error(`[ai] 使用量の記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 今日その人がその機能を何回使ったか */
export async function countTodayUsage(feature: AiFeature, staffId: string): Promise<number> {
  const { start, end } = jstDayBoundsUtc(todayJst());
  return fx().aiUsageLogs.count({ feature, staffId, createdAt: { gte: start, lt: end } });
}

/** 上限に達しているか（上限0は無制限） */
export async function isOverDailyLimit(db: DataStore, feature: AiFeature, staffId: string | null): Promise<boolean> {
  if (!staffId) return false;
  const limit = (await getAiLimits(db))[feature] ?? 0;
  if (limit <= 0) return false;
  return (await countTodayUsage(feature, staffId)) >= limit;
}

/** サーバー側のお断りの代わり（fallbacks）を付けられるモデルか（付けられないモデルに付けると400になる） */
function fallbackOptions(model: string): { betas: string[]; fallbacks: "default" } | Record<string, never> {
  return /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : {};
}

export type AiJsonResult<T> =
  | { ok: true; data: T; model: string; cached: boolean }
  | { ok: false; reason: "not_configured" | "limit" | "error" | "refusal" };

/**
 * JSONの形を決めてClaudeに作ってもらう（構造化出力）。短い仕事なので effort は low から。
 * system は機能ごとに固定の文（プロンプトキャッシュが効くように、変わる中身は prompt 側に入れる）。
 */
export async function runAiJson<T>(
  db: DataStore,
  req: {
    feature: AiFeature;
    staffId: string | null;
    system: string;
    prompt: string;
    schema: Record<string, unknown>;
    cacheKey?: string;
    /** キャッシュの有効期限（時間）。省略は無期限 */
    cacheHours?: number;
    maxTokens?: number;
    effort?: "low" | "medium" | "high";
    parse: (raw: unknown) => T | null;
  }
): Promise<AiJsonResult<T>> {
  if (!isAnthropicConfigured()) return { ok: false, reason: "not_configured" };

  if (req.cacheKey) {
    const hit = await fx().aiCache.find({ cacheKey: req.cacheKey });
    const fresh = !req.cacheHours || (hit && Date.now() - hit.createdAt.getTime() < req.cacheHours * 3600_000);
    if (hit && fresh) {
      const data = req.parse(hit.value);
      if (data !== null) return { ok: true, data, model: "", cached: true };
    }
  }
  if (await isOverDailyLimit(db, req.feature, req.staffId)) return { ok: false, reason: "limit" };

  const model = env.aiToolsModel;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.beta.messages.create({
      model,
      max_tokens: req.maxTokens ?? 6000,
      ...fallbackOptions(model),
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: req.effort ?? "low", format: { type: "json_schema", schema: req.schema } },
      messages: [{ role: "user", content: maskPersonalInfo(req.prompt) }],
    });
    await logAiUsage({ feature: req.feature, staffId: req.staffId, model: response.model, usage: response.usage, ok: response.stop_reason !== "refusal" });
    if (response.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "error" };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const raw = JSON.parse(text) as unknown;
    const data = req.parse(raw);
    if (data === null) return { ok: false, reason: "error" };
    if (req.cacheKey) {
      try {
        await fx().aiCache.upsert({ cacheKey: req.cacheKey, feature: req.feature, value: raw, createdAt: new Date() }, ["cacheKey"]);
      } catch (e) {
        console.error(`[ai] 結果の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { ok: true, data, model: response.model, cached: false };
  } catch (e) {
    console.error(`[ai] ${req.feature} でエラー: ${e instanceof Error ? e.message : String(e)}`);
    await logAiUsage({ feature: req.feature, staffId: req.staffId, model, usage: null, ok: false, note: e instanceof Error ? e.name : "error" });
    return { ok: false, reason: "error" };
  }
}

// ---- 管理画面の集計（月ごと） ----

/** 1MTokあたりのドル（目安。モデルの一覧は claude-api の料金表に合わせる。知らないモデルは Sonnet と同じ） */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-fable-5-2": { input: 8, output: 40 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function estimateUsd(row: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): number {
  const key = Object.keys(PRICE_PER_MTOK).find((k) => row.model.startsWith(k)) ?? "claude-sonnet-5";
  const p = PRICE_PER_MTOK[key];
  // キャッシュの読み込みは入力の1割、書き込みは1.25倍（目安）
  return (
    (row.inputTokens * p.input + row.cacheReadTokens * p.input * 0.1 + row.cacheWriteTokens * p.input * 1.25 + row.outputTokens * p.output) /
    1_000_000
  );
}

export interface AiMonthlyRow {
  feature: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

export async function aiMonthlySummary(month: string): Promise<{ rows: AiMonthlyRow[]; byStaff: Map<string, number> }> {
  const [y, m] = month.split("-").map(Number);
  const start = jstDayBoundsUtc(`${month}-01`).start;
  const next = new Date(Date.UTC(y, m, 1));
  const end = jstDayBoundsUtc(next.toISOString().slice(0, 10)).start;
  const logs = await fx().aiUsageLogs.list({ where: { createdAt: { gte: start, lt: end } } });
  const map = new Map<string, AiMonthlyRow>();
  const byStaff = new Map<string, number>();
  for (const l of logs) {
    const row =
      map.get(l.feature) ??
      { feature: l.feature, calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
    row.calls++;
    if (!l.ok) row.failed++;
    row.inputTokens += l.inputTokens;
    row.outputTokens += l.outputTokens;
    row.cacheReadTokens += l.cacheReadTokens;
    row.cacheWriteTokens += l.cacheWriteTokens;
    row.usd += estimateUsd(l);
    map.set(l.feature, row);
    if (l.staffId) byStaff.set(l.staffId, (byStaff.get(l.staffId) ?? 0) + 1);
  }
  return { rows: [...map.values()].sort((a, b) => b.calls - a.calls), byStaff };
}
