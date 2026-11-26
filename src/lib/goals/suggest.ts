// 依頼19：AIが「今週（今月）いちばんやるべきこと」を3つほど出す。
//  ・毎週月曜と毎月1日（初期値）に、本人の目標・進み具合・日報の提出・稼働率（依頼17）・練習時間から作る
//  ・1人1週（1月）1回だけ作って保存する（開くたびには作らない）。AIが使えないときは、決まった作り方の一覧にする
//  ・AIに渡すのは本人の目標・アクションプラン・数字だけ。日報の文章・お客様の情報は渡さない
//  ・本人が採用・修正・却下できる。採用したらタスクになる（最後は人が決める）

import { fx } from "@/lib/data/tables";
import type { AiSuggestion, SuggestionItem } from "@/lib/data/tables";
import { runAiJson, cacheKeyOf } from "@/lib/ai/run";
import { addDays, addMonths, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { goalTreeFor } from "@/lib/goals";
import { monthUtilization } from "@/lib/utilization";
import type { DataStore } from "@/lib/data/types";

export function periodKeyOf(scope: "week" | "month", today = todayJst()): string {
  return scope === "week" ? weekStartOf(today) : today.slice(0, 7);
}

interface Material {
  scope: "week" | "month";
  goals: { title: string; period: string; area: string; target: string; progress: number | null; plans: { title: string; progress: number | null; done: boolean }[] }[];
  practiceMinutes: { thisMonth: number; lastMonth: number };
  utilization: number | null;
  reportsThisWeek: number;
}

async function materialFor(db: DataStore, staffId: string, storeId: string, scope: "week" | "month"): Promise<Material> {
  const today = todayJst();
  const month = today.slice(0, 7);
  const tree = await goalTreeFor(db, staffId, storeId);
  const [thisMonth, lastMonth, util, reports] = await Promise.all([
    db.listPracticeRecords({ staffId, ...monthRange(month) }),
    db.listPracticeRecords({ staffId, ...monthRange(addMonths(month, -1)) }),
    monthUtilization(month, [staffId]).catch(() => []),
    db.listEniReports("stylist", { staffId, from: weekStartOf(today), to: today }),
  ]);
  return {
    scope,
    goals: tree.personal.slice(0, 8).map((n) => ({
      title: n.goal.title,
      period: n.goal.periodKey,
      area: n.goal.area,
      target: n.goal.targetValue ? `${n.goal.targetValue}${n.goal.unit}` : "",
      progress: n.progress,
      plans: n.plans.slice(0, 6).map((p) => ({ title: p.title, progress: p.progress, done: p.done })),
    })),
    practiceMinutes: { thisMonth: thisMonth.reduce((s, r) => s + r.minutes, 0), lastMonth: lastMonth.reduce((s, r) => s + r.minutes, 0) },
    utilization: util[0]?.rate ?? null,
    reportsThisWeek: reports.length,
  };
}

/** AIが使えないときの一覧（決まった作り方） */
export function fallbackItems(m: Material): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const open = m.goals.flatMap((g) => g.plans.filter((p) => !p.done).map((p) => ({ g, p })));
  open.sort((a, b) => (a.p.progress ?? 0) - (b.p.progress ?? 0));
  for (const { g, p } of open.slice(0, 2)) {
    items.push({ text: `「${p.title}」を進める`, detail: `目標「${g.title}」${p.progress !== null ? `・いま${p.progress}%` : ""}`, status: "pending", taskId: "" });
  }
  if (m.goals.length === 0) items.push({ text: "今月の目標を1つ立てる", detail: "目標の画面で、年と月の目標を登録", status: "pending", taskId: "" });
  if (m.practiceMinutes.thisMonth < m.practiceMinutes.lastMonth) {
    items.push({ text: "練習の時間を先月より増やす", detail: `今月 ${Math.round(m.practiceMinutes.thisMonth / 60)}時間・先月 ${Math.round(m.practiceMinutes.lastMonth / 60)}時間`, status: "pending", taskId: "" });
  }
  if (items.length < 3) items.push({ text: "週の振り返りを書く", detail: "できたこと・できなかったこと・来週やること", status: "pending", taskId: "" });
  return items.slice(0, 3);
}

const SYSTEM = `あなたは美容室ENi・アイラッシュサロン「イーリス」のスタッフの成長を手伝うコーチです。
本人の目標・アクションプラン・数字から、指定された期間（今週／今月）に「いちばんやるべきこと」を3つ選んでください。
- 1つは短い行動の文（30字以内・動詞で終わる）。detail には、なぜそれか（どの目標・数字から）を40字以内で
- 進み具合が低いアクションプラン、期限が近い目標、下がっている数字を優先する
- 本人を責める言い方はしない。具体的に、その期間でできる大きさにする`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, detail: { type: "string" } },
        required: ["text", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** その期間のAIの提案（なければ作って保存する。1人1期間1回だけ） */
export async function getOrCreateSuggestion(db: DataStore, staffId: string, scope: "week" | "month", opts: { create?: boolean } = {}): Promise<AiSuggestion | null> {
  const f = fx();
  const periodKey = periodKeyOf(scope);
  const existing = await f.aiSuggestions.find({ staffId, scope, periodKey });
  if (existing || opts.create === false) return existing;
  const me = await db.getStaff(staffId);
  if (!me) return null;
  const m = await materialFor(db, staffId, me.storeId, scope);
  const prompt = `期間：${scope === "week" ? "今週" : "今月"}（${periodKey}）\n${JSON.stringify(m)}`;
  const result = await runAiJson(db, {
    feature: "goal_suggest",
    staffId,
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    cacheKey: cacheKeyOf("goal_suggest", staffId, scope, periodKey, JSON.stringify(m)),
    maxTokens: 4000,
    effort: "low",
    parse: (raw) => {
      const items = (raw as { items?: unknown[] })?.items;
      if (!Array.isArray(items)) return null;
      const out = items
        .map((i) => i as { text?: unknown; detail?: unknown })
        .filter((i) => typeof i.text === "string" && i.text.trim())
        .slice(0, 3)
        .map((i): SuggestionItem => ({ text: String(i.text).trim().slice(0, 60), detail: String(i.detail ?? "").trim().slice(0, 80), status: "pending", taskId: "" }));
      return out.length ? out : null;
    },
  });
  const row = {
    staffId,
    scope,
    periodKey,
    items: result.ok ? result.data : fallbackItems(m),
    ai: result.ok,
    model: result.ok ? result.model : "",
  };
  // 同時に作られたときは、先に保存された方を使う
  const again = await f.aiSuggestions.find({ staffId, scope, periodKey });
  if (again) return again;
  return f.aiSuggestions.insert(row);
}

/** 採用・修正して採用・却下。採用したらタスクにする（期限：週の終わり／月の終わり） */
export async function decideSuggestion(
  db: DataStore,
  staffId: string,
  id: string,
  index: number,
  decision: "adopt" | "reject",
  editedText?: string
): Promise<string> {
  const f = fx();
  const s = await f.aiSuggestions.get(id);
  if (!s || s.staffId !== staffId) throw new Error("提案が見つかりません");
  const items = [...s.items];
  const item = items[index];
  if (!item || item.status !== "pending") throw new Error("もう決めています");
  if (decision === "reject") {
    items[index] = { ...item, status: "rejected" };
  } else {
    const text = (editedText ?? item.text).trim().slice(0, 60) || item.text;
    const due = s.scope === "week" ? addDays(s.periodKey, 6) : monthRange(s.periodKey).to;
    const task = await db.createStaffTask({
      taskType: "task",
      kind: "routine",
      title: text,
      note: `${s.ai ? "AIの提案" : "提案"}から（${s.scope === "week" ? "今週" : "今月"}いちばんやるべきこと）${item.detail ? `：${item.detail}` : ""}`,
      assigneeStaffId: staffId,
      createdBy: staffId,
      dueDate: due,
      repeat: "",
      repeatDays: [],
      status: "open",
    });
    items[index] = { ...item, text, status: "adopted", taskId: task.id };
  }
  await f.aiSuggestions.update(id, { items, updatedAt: new Date() });
  return decision === "adopt" ? "採用して、タスクにしました" : "却下しました";
}
