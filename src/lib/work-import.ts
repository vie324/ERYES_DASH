// 依頼16：業務の整理（宿題シート「4つの問い」）の結果を、アプリにまとめて反映する。
// ENiが記入した表（業務・今の担当・前回の結論・来月からの担当とやり方・アプリに載せたいか）を貼るかCSVで取り込むと、
// 「アプリに載せたい」業務を次のどれかに当てはめて、そのまま登録できる形にする：
//   ルーティン（依頼1）／単発のタスク（依頼1）／毎日の必須入力（依頼14）／Wikiのマニュアル（依頼11）／今のアプリにない機能（次の依頼）
// まず「確認」で当てはめの一覧を出し、管理者が「この内容で取り込む」を押したときだけ登録する。
// 判断できない行（担当が空欄など）は、登録せずに一覧に残す（報告のTODOにする）。
// ※ 2026-11-26 時点で、表はまだ届いていない（届いたらこの画面に貼る）。

import { parseCsv } from "@/lib/csv-parse";
import type { DataStore, ManagerRoutine, RoutineCycle, Staff, TaskRepeat } from "@/lib/data/types";

export type Target = "routine" | "task" | "required" | "wiki" | "feature" | "skip";

export const TARGET_LABEL: Record<Target, string> = {
  routine: "ルーティン",
  task: "単発のタスク",
  required: "毎日の必須入力",
  wiki: "Wikiのマニュアル",
  feature: "今のアプリにない機能（次の依頼）",
  skip: "載せない",
};

export interface WorkRow {
  line: number;
  work: string;
  currentOwner: string;
  lastConclusion: string;
  nextOwner: string;
  howTo: string;
  wantInApp: boolean;
  /** 表に書かれた当てはめ先（無ければ自動で推測） */
  target: Target;
  targetGuessed: boolean;
  /** 頻度：daily / weekly:1,3 / monthly:5 / once */
  frequency: string;
  due: string;
  /** 担当（ロール名・人の名前・店舗名） */
  owner: string;
  checker: string;
  issues: string[];
}

const HEAD = {
  work: ["業務", "仕事", "作業"],
  currentOwner: ["今の担当", "現在の担当", "今担当"],
  lastConclusion: ["前回の結論", "結論"],
  nextOwner: ["来月からの担当", "来月の担当", "新しい担当", "担当"],
  howTo: ["やり方", "方法", "手順"],
  want: ["アプリに載せたい", "アプリ", "載せたい"],
  target: ["当てはめ", "種類", "区分"],
  frequency: ["頻度", "くり返し", "繰り返し"],
  due: ["期限", "締め"],
  checker: ["確認する人", "確認者", "チェック"],
};

function findCol(head: string[], names: string[]): number {
  return head.findIndex((h) => names.some((n) => h.replace(/\s/g, "").includes(n)));
}

/** 表（CSV・タブ区切り）を読み、行ごとに当てはめ先を決める */
export function parseWorkTable(text: string): { rows: WorkRow[]; errors: string[] } {
  const clean = text.replace(/^﻿/, "");
  // Excel・スプレッドシートからの貼り付け（タブ区切り）にも対応
  const table = clean.includes("\t") && !clean.split("\n")[0].includes(",")
    ? clean.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split("\t"))
    : parseCsv(clean);
  if (table.length < 2) return { rows: [], errors: ["1行目に見出し、2行目から業務を入れてください"] };
  const head = table[0].map((h) => h.trim());
  const ci = Object.fromEntries(Object.entries(HEAD).map(([k, names]) => [k, findCol(head, names)])) as Record<keyof typeof HEAD, number>;
  if (ci.work < 0) return { rows: [], errors: ["見出しに「業務」の列が必要です"] };
  const rows: WorkRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (k: keyof typeof HEAD) => (ci[k] >= 0 ? (cells[ci[k]] ?? "").trim() : "");
    const work = get("work");
    if (!work) return;
    const wantRaw = get("want");
    const wantInApp = ci.want < 0 ? true : /^(○|〇|◯|はい|yes|y|1|true|載せる|載せたい)/i.test(wantRaw);
    const howTo = get("howTo");
    const frequency = normalizeFrequency(get("frequency") || `${work} ${howTo}`);
    const explicit = targetFromText(get("target"));
    const target: Target = !wantInApp ? "skip" : (explicit ?? guessTarget(work, howTo, frequency));
    const owner = get("nextOwner") || get("currentOwner");
    const issues: string[] = [];
    if (target !== "skip" && target !== "wiki" && target !== "feature" && !owner) issues.push("担当が空欄");
    if (target === "routine" && frequency === "once") issues.push("頻度が分からない（毎日・毎週◯曜・毎月◯日）");
    if (target === "task" && !get("due")) issues.push("期限が空欄");
    rows.push({
      line: i + 2,
      work: work.slice(0, 120),
      currentOwner: get("currentOwner"),
      lastConclusion: get("lastConclusion"),
      nextOwner: get("nextOwner"),
      howTo,
      wantInApp,
      target,
      targetGuessed: !explicit && wantInApp,
      frequency,
      due: get("due"),
      owner,
      checker: get("checker"),
      issues,
    });
  });
  return { rows, errors: [] };
}

function targetFromText(raw: string): Target | null {
  if (!raw) return null;
  if (/ルーティン|毎日|毎週|毎月|くり返し|繰り返し/.test(raw)) return "routine";
  if (/タスク|単発|1回|一回/.test(raw)) return "task";
  if (/必須|入力/.test(raw)) return "required";
  if (/wiki|ウィキ|マニュアル|ルール/i.test(raw)) return "wiki";
  if (/機能|新しく|次の依頼|開発/.test(raw)) return "feature";
  if (/載せない|なし|×/.test(raw)) return "skip";
  return null;
}

function guessTarget(work: string, howTo: string, frequency: string): Target {
  const text = `${work} ${howTo}`;
  if (/入力|記入|打刻|報告/.test(text) && frequency === "daily") return "required";
  if (/マニュアル|ルール|手順書|決まり/.test(text)) return "wiki";
  if (frequency !== "once") return "routine";
  if (/システム|アプリで|自動|連携/.test(text)) return "feature";
  return "task";
}

/** 「毎日」「毎週月・木」「毎月5日」「週1」などを daily / weekly:1,4 / monthly:5 / once に */
export function normalizeFrequency(raw: string): string {
  const t = raw.replace(/\s/g, "");
  if (/毎日|日次|デイリー|daily/i.test(t)) return "daily";
  const wk = t.match(/毎週([日月火水木金土・、,]+)/);
  if (wk) {
    const days = [...wk[1]].map((c) => "日月火水木金土".indexOf(c)).filter((n) => n >= 0);
    if (days.length) return `weekly:${[...new Set(days)].join(",")}`;
  }
  if (/毎週|週1|週次|ウィークリー|weekly/i.test(t)) return "weekly:1";
  const mo = t.match(/毎月(\d{1,2})日/);
  if (mo) return `monthly:${Number(mo[1])}`;
  if (/毎月|月1|月次|マンスリー|monthly/i.test(t)) return "monthly:1";
  return "once";
}

export function frequencyLabel(f: string): string {
  if (f === "daily") return "毎日";
  if (f.startsWith("weekly:")) return `毎週${f.slice(7).split(",").map((n) => "日月火水木金土"[Number(n)]).join("・")}`;
  if (f.startsWith("monthly:")) return `毎月${f.slice(8)}日`;
  return "1回";
}

/** 担当の文字（「幹部」「スタイリスト」「全員」・人の名前・呼び名）を、ロールか人に直す */
export function resolveOwner(owner: string, staff: Staff[]): { audience: "exec" | "stylist" | "assistant" | "all" | null; people: Staff[] } {
  const active = staff.filter((s) => s.isActive);
  const t = owner.replace(/[\s　]/g, "");
  if (/店長|副店長|幹部/.test(t)) return { audience: "exec", people: active.filter((s) => s.isExecutive) };
  if (/スタイリスト/.test(t)) return { audience: "stylist", people: active.filter((s) => s.jobType === "stylist") };
  if (/アシスタント/.test(t)) return { audience: "assistant", people: active.filter((s) => s.jobType === "assistant") };
  if (/全員|みんな|全スタッフ/.test(t)) return { audience: "all", people: active.filter((s) => s.role !== "admin") };
  const names = t.split(/[・、,/]/).filter(Boolean);
  const people = active.filter((s) => names.some((n) => s.name.replace(/[\s　]/g, "") === n || (s.nickname && s.nickname === n)));
  return { audience: null, people };
}

export interface ApplyResult {
  created: string[];
  nextRequests: string[];
  undecided: string[];
}

/** 当てはめた内容で登録する（判断できない行は登録しない） */
export async function applyWorkRows(
  db: DataStore,
  rows: WorkRow[],
  actorId: string,
  hooks: {
    createWiki: (title: string, body: string) => Promise<void>;
    createNextRequest: (title: string, detail: string) => Promise<void>;
    addRequiredInput: (label: string) => Promise<boolean>;
  }
): Promise<ApplyResult> {
  const staff = await db.listStaff();
  const out: ApplyResult = { created: [], nextRequests: [], undecided: [] };
  const routines = await db.listManagerRoutines();
  for (const r of rows) {
    if (r.target === "skip") continue;
    if (r.issues.length > 0) {
      out.undecided.push(`${r.line}行目「${r.work}」：${r.issues.join("・")}`);
      continue;
    }
    const note = [r.howTo, r.checker ? `確認する人：${r.checker}` : "", r.lastConclusion ? `前回の結論：${r.lastConclusion}` : ""].filter(Boolean).join("\n");
    if (r.target === "wiki") {
      await hooks.createWiki(r.work, [r.howTo || "（やり方をここに書く）", r.owner ? `\n担当：${r.owner}` : ""].join(""));
      out.created.push(`Wiki：${r.work}`);
      continue;
    }
    if (r.target === "feature") {
      await hooks.createNextRequest(r.work, note);
      out.nextRequests.push(r.work);
      continue;
    }
    if (r.target === "required") {
      const ok = await hooks.addRequiredInput(r.work);
      if (ok) out.created.push(`必須入力：${r.work}`);
      else {
        // 今の必須入力（出退勤・日報・売上・週報・レジ締め・予定）に無い入力は、新しい機能として次の依頼に回す
        await hooks.createNextRequest(`必須入力にしたい：${r.work}`, note);
        out.nextRequests.push(`必須入力にしたい：${r.work}`);
      }
      continue;
    }
    const { audience, people } = resolveOwner(r.owner, staff);
    if (r.target === "routine") {
      const [kind, arg] = r.frequency.split(":");
      if ((audience === "exec" || audience === "stylist") && !routines.some((m: ManagerRoutine) => m.title === r.work && m.audience === audience)) {
        // 幹部・スタイリストの毎日の業務（店舗ごと・人ごとにチェックする）。毎週・毎月はその周期で
        await db.createManagerRoutine({
          title: r.work,
          cycle: (kind === "weekly" ? "weekly" : kind === "monthly" ? "monthly" : "daily") as RoutineCycle,
          note,
          sortOrder: 100 + r.line,
          isActive: true,
          audience,
        });
        out.created.push(`${audience === "exec" ? "幹部" : "スタイリスト"}の毎日の業務：${r.work}`);
        continue;
      }
      if (people.length === 0) {
        out.undecided.push(`${r.line}行目「${r.work}」：担当（${r.owner}）がスタッフと一致しない`);
        continue;
      }
      const repeat: TaskRepeat = kind === "weekly" ? "weekly" : kind === "monthly" ? "monthly" : "daily";
      const repeatDays = arg ? arg.split(",").map(Number).filter((n) => Number.isFinite(n)) : [];
      for (const p of people) {
        await db.createStaffTask({
          taskType: "routine",
          kind: "request",
          title: r.work,
          note,
          assigneeStaffId: p.id,
          createdBy: actorId,
          dueDate: "",
          repeat,
          repeatDays,
          status: "open",
        });
      }
      out.created.push(`ルーティン：${r.work}（${people.map((p) => p.name).join("・")}）`);
      continue;
    }
    // 単発のタスク
    if (people.length === 0) {
      out.undecided.push(`${r.line}行目「${r.work}」：担当（${r.owner}）がスタッフと一致しない`);
      continue;
    }
    const due = normalizeDue(r.due);
    for (const p of people) {
      await db.createStaffTask({
        taskType: "task",
        kind: "request",
        title: r.work,
        note,
        assigneeStaffId: p.id,
        createdBy: actorId,
        dueDate: due,
        repeat: "",
        repeatDays: [],
        status: "open",
      });
    }
    out.created.push(`タスク：${r.work}（${people.map((p) => p.name).join("・")}${due ? `・${due}まで` : ""}）`);
  }
  return out;
}

function normalizeDue(raw: string): string {
  const m = raw.match(/(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

/** 取り込み用のひな形（見出し） */
export const TEMPLATE_HEAD = ["業務", "今の担当", "前回の結論", "来月からの担当", "やり方", "アプリに載せたいか", "当てはめ先", "頻度", "期限", "確認する人"];
