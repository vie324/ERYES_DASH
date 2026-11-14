// 依頼4（13・追加1・追加2・14）：ENiのホーム
//  デモのアカウント：staff-admin＝管理者／staff-3＝幹部のスタイリスト（山本 大輝）／
//                    staff-4＝スタイリスト（中島 結菜）／staff-5・staff-6＝アシスタント（小林 蒼・藤田 ひかり）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATALOG,
  canUseShortcut,
  homeRoleOf,
  parseShortcutSettings,
  shortcutsFor,
  storedShortcutOverrides,
} from "@/lib/home/shortcuts";
import { DEFAULT_INSIGHT_VISIBILITY, levelFor, parseInsightVisibility } from "@/lib/home/visibility";
import { buildHomeInsights, type InsightCard } from "@/lib/home/insights";
import { getWordOfDay, pickNextWord, previewWords } from "@/lib/home/words";
import { briefPrompt, buildBriefSource, fallbackBriefItems, getTodayBrief, isEmptySource } from "@/lib/home/brief";
import { getMyTaskSummary } from "@/lib/tasks";
import { addDays, todayJst } from "@/lib/date";
import { env } from "@/lib/env";
import { getMockStore } from "@/lib/data/mock-store";
import type { DailyWord, DailyWordShown, DataStore } from "@/lib/data/types";

// ---------------------------------------------------------------- ショートカット（追加1）

describe("ショートカット：管理者がロールごとに並べ、権限のない画面は出さない", () => {
  it("設定が無ければロールごとの初期値（1行4つ×2行）", () => {
    const s = parseShortcutSettings(undefined);
    expect(s).toEqual(DEFAULT_SHORTCUTS);
    for (const list of Object.values(s)) expect(list.length).toBe(8);
  });

  it("変えたロールだけが保存され、知らないキー・重複は捨てる。壊れたJSONは初期値", () => {
    const raw = JSON.stringify({ stylist: ["chat", "chat", "unknown", "tasks"], nope: ["x"] });
    expect(storedShortcutOverrides(raw)).toEqual({ stylist: ["chat", "tasks"] });
    const s = parseShortcutSettings(raw);
    expect(s.stylist).toEqual(["chat", "tasks"]);
    expect(s.assistant).toEqual(DEFAULT_SHORTCUTS.assistant);
    expect(parseShortcutSettings("{壊れた")).toEqual(DEFAULT_SHORTCUTS);
  });

  it("ロールは 管理者 → 幹部 → 職種 → そのほか の順に決まる", () => {
    expect(homeRoleOf({ isAdmin: true, isExec: true, jobType: "" })).toBe("admin");
    expect(homeRoleOf({ isAdmin: false, isExec: true, jobType: "stylist" })).toBe("exec");
    expect(homeRoleOf({ isAdmin: false, isExec: false, jobType: "stylist" })).toBe("stylist");
    expect(homeRoleOf({ isAdmin: false, isExec: false, jobType: "assistant" })).toBe("assistant");
    expect(homeRoleOf({ isAdmin: false, isExec: false, jobType: "" })).toBe("other");
  });

  it("幹部メニュー・組織図などは、設定に入れてもスタイリスト・アシスタントには出ない", () => {
    const settings = parseShortcutSettings(
      JSON.stringify({ stylist: ["exec", "org", "absence", "tasks"], assistant: ["exec", "eniReport", "weeklyReport"] })
    );
    const stylist = shortcutsFor(settings, { isAdmin: false, isExec: false, jobType: "stylist" }).map((s) => s.key);
    expect(stylist).toEqual(["tasks"]);
    const assistant = shortcutsFor(settings, { isAdmin: false, isExec: false, jobType: "assistant" }).map((s) => s.key);
    expect(assistant).toEqual(["weeklyReport"]);
    // 幹部は自分のロールの並びどおりに出る
    const exec = shortcutsFor(settings, { isAdmin: false, isExec: true, jobType: "stylist" }).map((s) => s.key);
    expect(exec).toEqual(DEFAULT_SHORTCUTS.exec);
  });

  it("日報・週報の一覧は、職種のない人（幹部以外）には出さない（開いても戻されるため）", () => {
    const def = SHORTCUT_CATALOG.find((s) => s.key === "eniReports")!;
    expect(canUseShortcut(def, { isExec: false, jobType: "" })).toBe(false);
    expect(canUseShortcut(def, { isExec: false, jobType: "assistant" })).toBe(true);
    expect(canUseShortcut(def, { isExec: true, jobType: "" })).toBe(true);
  });

  it("カタログのリンクは、すべてアプリの中の画面", () => {
    for (const s of SHORTCUT_CATALOG) expect(s.href.startsWith("/staff/")).toBe(true);
  });
});

// ---------------------------------------------------------------- 見える化の設定（追加2）

describe("見える化の設定：初期値は酒井案、管理者が項目ごとに変えられる", () => {
  it("初期値は表のとおり", () => {
    const v = parseInsightVisibility(null);
    expect(v.thanks).toEqual({ all: "names", self: true, exec: "names" });
    expect(v.weeklyReports).toEqual({ all: "summary", self: true, exec: "names" });
    expect(v.tasks).toEqual({ all: "summary", self: true, exec: "names" });
    expect(v.unread).toEqual({ all: "summary", self: true, exec: "names" });
    expect(v.routines).toEqual({ all: "none", self: true, exec: "names" });
  });

  it("保存された分だけ上書きし、おかしな値は初期値のまま", () => {
    const v = parseInsightVisibility(JSON.stringify({ tasks: { all: "names", self: false, exec: "bad" } }));
    expect(v.tasks).toEqual({ all: "names", self: false, exec: "names" });
    expect(v.thanks).toEqual(DEFAULT_INSIGHT_VISIBILITY.thanks);
    expect(parseInsightVisibility("壊れた")).toEqual(DEFAULT_INSIGHT_VISIBILITY);
  });

  it("幹部・管理者は exec 列、それ以外は all 列", () => {
    expect(levelFor(DEFAULT_INSIGHT_VISIBILITY.tasks, { isExec: true })).toBe("names");
    expect(levelFor(DEFAULT_INSIGHT_VISIBILITY.tasks, { isExec: false })).toBe("summary");
  });
});

// ---------------------------------------------------------------- 見える化の中身（名前は権限のある人の分だけ作る）

describe("見える化：全員・本人・幹部の3つのアカウントで、名前は見る権限のある人にだけ返る", () => {
  const db = getMockStore();
  const today = todayJst();
  const vis = parseInsightVisibility(null);
  const byKey = (cards: InsightCard[]) => new Map(cards.map((c) => [c.key, c]));

  // 名前つきの判定が確かめられるように、期限切れのタスクを1つ作っておく（アシスタントの小林 蒼）
  beforeEach(async () => {
    const tasks = await db.listStaffTasks({ includeDone: false });
    if (!tasks.some((t) => t.title === "【テスト】期限切れのタスク")) {
      await db.createStaffTask({
        title: "【テスト】期限切れのタスク",
        note: "",
        kind: "request",
        taskType: "task",
        assigneeStaffId: "staff-5",
        createdBy: "staff-3",
        dueDate: addDays(today, -2),
        repeat: "",
        repeatDays: [],
        status: "open",
      });
    }
  });

  it("スタイリスト（全員の列）：②③④は集計だけで名前なし、⑤は出ない", async () => {
    const cards = byKey(
      await buildHomeInsights(db, { staffId: "staff-4", isExec: false, storeId: "store-4", jobType: "stylist" }, vis, today)
    );
    for (const key of ["weeklyReports", "tasks", "unread"] as const) {
      const card = cards.get(key)!;
      expect(card.level).toBe("summary");
      expect(card.names).toBeNull();
      expect(card.summary).not.toBeNull();
    }
    // 幹部ルーティンは「出さない」＋幹部ではないので本人の分も無い → カードごと出ない
    expect(cards.has("routines")).toBe(false);
    // 返ってくるデータのどこにも、ほかの人の未提出・未完了の名前が入っていない（①は全員に名前を出す設定）
    const json = JSON.stringify([...cards.values()].filter((c) => c.key !== "thanks"));
    for (const name of ["小林 蒼", "藤田 ひかり", "山本 大輝"]) expect(json).not.toContain(name);
  });

  it("本人の列：アシスタントには自分の週報・タスク・未読が出る", async () => {
    const cards = byKey(
      await buildHomeInsights(db, { staffId: "staff-5", isExec: false, storeId: "store-4", jobType: "assistant" }, vis, today)
    );
    expect(cards.get("weeklyReports")!.self).not.toBeNull();
    expect(cards.get("tasks")!.self!.text).toContain("1件");
    expect(cards.get("unread")!.self).not.toBeNull();
  });

  it("幹部の列：②③④⑤は名前で返る（期限切れのタスクがある人の名前も入る）", async () => {
    const cards = byKey(
      await buildHomeInsights(db, { staffId: "staff-3", isExec: true, storeId: "store-4", jobType: "stylist" }, vis, today)
    );
    for (const key of ["weeklyReports", "tasks", "unread", "routines"] as const) {
      expect(cards.get(key)?.level).toBe("names");
    }
    const tasks = cards.get("tasks")!;
    expect(JSON.stringify(tasks.names)).toContain("小林 蒼");
    // ⑤ 本人（店舗の幹部）の分も出る
    expect(cards.get("routines")!.self).not.toBeNull();
  });

  it("管理者が「出さない」にした項目は、本人の分も外せばカードごと返らない", async () => {
    const hidden = parseInsightVisibility(JSON.stringify({ thanks: { all: "none", self: false, exec: "none" } }));
    const cards = await buildHomeInsights(
      db,
      { staffId: "staff-3", isExec: true, storeId: "store-4", jobType: "stylist" },
      hidden,
      today
    );
    expect(cards.some((c) => c.key === "thanks")).toBe(false);
  });
});

// ---------------------------------------------------------------- しもんさんの言葉（14）

const word = (id: string, sortOrder: number, isActive = true): DailyWord => ({
  id,
  body: `言葉${id}`,
  sortOrder,
  isActive,
  createdAt: new Date(2026, 0, sortOrder),
});

/** 言葉まわりだけを持つ小さなデータストア */
function wordStore(words: DailyWord[]) {
  const shown: DailyWordShown[] = [];
  const store = {
    listDailyWords: async () => words.map((w) => ({ ...w })),
    listDailyWordShown: async (limit: number) =>
      [...shown].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit),
    recordDailyWordShown: async (date: string, wordId: string) => {
      if (!shown.some((r) => r.date === date)) shown.push({ date, wordId });
    },
  };
  return { db: store as unknown as DataStore, shown };
}

describe("しもんさんの言葉：1日1つ・全員同じ・登録順にくり返さず・全部出たら最初に戻る", () => {
  it("登録順に1つずつ進み、最後まで出たら最初に戻る", async () => {
    const { db } = wordStore([word("a", 10), word("b", 20), word("c", 30)]);
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
    const picked: string[] = [];
    for (const d of days) picked.push((await getWordOfDay(db, d))!.id);
    expect(picked).toEqual(["a", "b", "c", "a"]);
  });

  it("同じ日に何度開いても（だれが開いても）同じ言葉", async () => {
    const { db, shown } = wordStore([word("a", 10), word("b", 20)]);
    const first = await getWordOfDay(db, "2026-11-01");
    const again = await getWordOfDay(db, "2026-11-01");
    expect(again!.id).toBe(first!.id);
    expect(shown).toHaveLength(1);
  });

  it("止めた言葉は飛ばし、消した言葉はその前に出した言葉の続きから", () => {
    const words = [word("a", 10), word("b", 20, false), word("c", 30), word("d", 40)];
    expect(pickNextWord(words, ["a"])!.id).toBe("c");
    // 直前に出した c が消えていたら、その前に出した a の続き（b は止めているので c も無く → d）
    const withoutC = words.filter((w) => w.id !== "c");
    expect(pickNextWord(withoutC, ["c", "a"])!.id).toBe("d");
    expect(pickNextWord(words, [])!.id).toBe("a");
  });

  it("1件も登録が無ければ null（朝のカードのこの部分は出さない・エラーにしない）", async () => {
    const { db } = wordStore([]);
    expect(await getWordOfDay(db, "2026-11-01")).toBeNull();
    const stopped = wordStore([word("a", 10, false)]);
    expect(await getWordOfDay(stopped.db, "2026-11-01")).toBeNull();
    expect(previewWords([], [], "2026-11-01")).toEqual({ todayId: null, nextId: null });
  });

  it("管理画面の目印：今日の言葉と次に出る言葉（読むだけで記録しない）", () => {
    const words = [word("a", 10), word("b", 20), word("c", 30)];
    const shown: DailyWordShown[] = [{ date: "2026-11-01", wordId: "a" }];
    expect(previewWords(words, shown, "2026-11-02")).toEqual({ todayId: "b", nextId: "c" });
    expect(previewWords(words, [...shown, { date: "2026-11-02", wordId: "b" }], "2026-11-02")).toEqual({
      todayId: "b",
      nextId: "c",
    });
  });
});

// ---------------------------------------------------------------- AIの「今日のタスク」（14）

const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create: anthropicCreate } };
  },
}));

describe("今日のタスク：本人の情報だけで作り、1人1日1回だけ保存する", () => {
  const db = getMockStore();
  const today = todayJst();
  const originalKey = env.anthropicApiKey;

  afterEach(() => {
    env.anthropicApiKey = originalKey;
    anthropicCreate.mockReset();
  });

  it("AIに渡す材料は本人のタスクだけ（ほかの人のタスク・依頼した人の名前・トークの中身は入らない）", async () => {
    await db.createStaffTask({
      title: "【テスト】ほかの人のタスク",
      note: "",
      kind: "request",
      taskType: "task",
      assigneeStaffId: "staff-6",
      createdBy: "staff-3",
      dueDate: today,
      repeat: "",
      repeatDays: [],
      status: "open",
    });
    const summary = await getMyTaskSummary(db, "staff-5", today);
    const src = buildBriefSource({ today, summary, unread: 2, companyTodo: ["今週の週報を入力する"] });
    const prompt = briefPrompt(src);
    expect(prompt).not.toContain("ほかの人のタスク");
    for (const name of ["山本 大輝", "藤田 ひかり", "中島 結菜"]) expect(prompt).not.toContain(name);
    expect(prompt).toContain("未読のトーク：2件");
  });

  it("AIが使えないときの普通の一覧：期限切れ → 会社のタスク → ルーティン の順に3つまで", () => {
    const items = fallbackBriefItems({
      today: "2026-11-14",
      routines: ["朝の掃除", "カルテ記入チェック"],
      dailyItems: ["営業フィードバック"],
      tasks: [
        { title: "期限切れの依頼", due: "2026-11-12", overdue: true },
        { title: "来週の準備", due: "2026-11-16", overdue: false },
      ],
      companyTodo: ["今日の日報を入力する"],
      unread: 3,
    });
    expect(items.map((i) => i.text)).toEqual(["期限切れの依頼", "今日の日報を入力する", "朝の掃除"]);
    expect(isEmptySource({ today: "x", routines: [], dailyItems: [], tasks: [], companyTodo: [], unread: 0 })).toBe(true);
  });

  it("APIキーが未設定なら、AIを呼ばずに普通の一覧を返す（保存もしない）", async () => {
    env.anthropicApiKey = "";
    const brief = await getTodayBrief(db, "staff-4", today);
    expect(brief.ai).toBe(false);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(await db.getDailyBrief("staff-4", today)).toBeNull();
  });

  it("APIキーがあれば、1人1日1回だけAIで作って保存し、2回目からは保存した分を返す", async () => {
    env.anthropicApiKey = "test-key";
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      model: "test-model",
      content: [{ type: "text", text: JSON.stringify({ items: [{ text: "週報を出す", detail: "会社のタスク" }] }) }],
    });
    const first = await getTodayBrief(db, "staff-6", today);
    const second = await getTodayBrief(db, "staff-6", today);
    expect(first.ai).toBe(true);
    expect(first.items[0].text).toBe("週報を出す");
    expect(second.items).toEqual(first.items);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("AIがお断り・失敗のときは普通の一覧を保存し、その日はもうAIを呼ばない", async () => {
    env.anthropicApiKey = "test-key";
    anthropicCreate.mockResolvedValue({ stop_reason: "refusal", model: "test-model", content: [] });
    const first = await getTodayBrief(db, "staff-5", today);
    const second = await getTodayBrief(db, "staff-5", today);
    expect(first.ai).toBe(false);
    expect(second.ai).toBe(false);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });
});
