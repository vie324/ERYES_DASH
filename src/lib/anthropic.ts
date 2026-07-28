// 議事録のAI整形（Anthropic Messages API / 公式SDK）。
// 生の議事メモを、決められたルール（見やすい構成＋タスク整理）に沿ってMarkdownへ整え、
// 同時に「誰が・何を・いつまでに」を構造化データ（tasks）で取り出す。
// ANTHROPIC_API_KEY 未設定時は、簡易テンプレートで整形して返す（デモでも動く）。

import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "@/lib/env";

export interface MinutesInput {
  meetingName: string; // 会議名（種類・題名）
  dateLabel: string; // 日付ラベル（表示用）
  meetingDate: string; // "YYYY-MM-DD"（「来週まで」等の相対表現を日付に直すために渡す）
  participants: string; // 参加者（読点区切り）
  agenda: string; // アジェンダ（議題）
  rawNotes: string; // 当日の生メモ
}

/** 議事録から取り出したタスク（誰が・何を・いつまでに） */
export interface ExtractedTask {
  title: string; // 何を（動詞から始まる短い文）
  assignee: string; // 誰が（不明なら「未定」）
  due: string; // いつまでに（"YYYY-MM-DD"。未定は空文字）
}

export interface MinutesResult {
  markdown: string;
  tasks: ExtractedTask[];
  ai: boolean; // AIで整形できたか（falseはテンプレート整形）
}

// 議事録のルール（プロンプト）。見やすい構成・タスク整理（誰が・何を・いつまでに）を必須にする。
const SYSTEM_RULES = `あなたは美容室「ENi」の議事録アシスタントです。会議の生メモを、読みやすく整った議事録に整え、あわせてタスクを整理します。次のルールに必ず従ってください。

# 議事録（markdown）のルール
- 日本語。Markdownのみ。前置きや後書きは書かない。
- 見出しは「##」を使い、次の順序で構成する：
  ## 会議の概要（会議名・日付・参加者を箇条書き）
  ## 決まったこと（決定事項を箇条書き。無ければ「特になし」）
  ## 話し合った内容（要点を簡潔な箇条書きで。冗長にしない）
  ## ネクストアクション（下記の表を必ず作る）
  ## 次回までに / 申し送り（任意）
- 「ネクストアクション」は必ず次のMarkdown表にする（tasksと同じ内容を並べる）：
  | タスク | 担当 | 期限 |
  | --- | --- | --- |
- 太字（**）や箇条書きを活用し、ぱっと見て把握できる構成にする。

# タスク整理（tasks）のルール
- 「いつまでに・何を・誰がやるのか」を1件ずつ取り出す。会議で決まった宿題・持ち帰り・確認事項はすべて拾う。
- title：動詞から始まる短い文（例「カラー剤の在庫を数えて発注する」）。誰が・いつまでには含めない。
- assignee：メモに出てくる担当者の名前をそのまま書く。読み取れない場合は「未定」。
- due：期限を "YYYY-MM-DD" で書く。「来週まで」「今月中」などは会議日を基準に具体的な日付へ直す。期限が読み取れない場合は空文字にする。
- タスクが1件も無い会議なら tasks は空配列にする。

# 共通
- 生メモに無い事実を創作しない。不明点は議事録本文に「（要確認）」と明記する。`;

// 構造化出力のスキーマ。markdown と tasks を必ずセットで返させる。
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    markdown: {
      type: "string",
      description: "整形済みの議事録（Markdown）",
    },
    tasks: {
      type: "array",
      description: "議事録から整理したタスク（誰が・何を・いつまでに）",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "何をやるか（動詞から始まる短い文）" },
          assignee: { type: "string", description: "担当者の名前。不明なら「未定」" },
          due: { type: "string", description: "期限 YYYY-MM-DD。未定なら空文字" },
        },
        required: ["title", "assignee", "due"],
        additionalProperties: false,
      },
    },
  },
  required: ["markdown", "tasks"],
  additionalProperties: false,
} as const;

/** 生メモ → 整形済み議事録（Markdown）＋タスク一覧 */
export async function generateMinutes(input: MinutesInput): Promise<MinutesResult> {
  if (!isAnthropicConfigured()) return fallbackResult(input);

  const userContent =
    `会議名：${input.meetingName}\n会議日：${input.meetingDate}（${input.dateLabel}）\n` +
    `参加者：${input.participants || "（未記入）"}\n` +
    `アジェンダ：\n${input.agenda || "（なし）"}\n\n--- 当日の生メモ ---\n${input.rawNotes}`;

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 16000,
      system: SYSTEM_RULES,
      output_config: {
        effort: "medium", // 整形と抽出が主な作業。速さと精度のバランスを取る
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: userContent }],
    });

    // 安全側の判定：拒否や打ち切りのときはテンプレートに戻す
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error(`[anthropic] 議事録生成を中断: stop_reason=${response.stop_reason}`);
      return fallbackResult(input);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const parsed = JSON.parse(text) as { markdown?: unknown; tasks?: unknown };
    const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
    if (!markdown) return fallbackResult(input);

    return { markdown, tasks: normalizeTasks(parsed.tasks), ai: true };
  } catch (e) {
    console.error("[anthropic] 議事録生成エラー:", e);
    return fallbackResult(input);
  }
}

/** AIの返したタスクを保存できる形に整える */
function normalizeTasks(raw: unknown): ExtractedTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const r = (t ?? {}) as Record<string, unknown>;
      const due = String(r.due ?? "").trim();
      return {
        title: String(r.title ?? "").trim().slice(0, 200),
        assignee: String(r.assignee ?? "").trim().slice(0, 40),
        due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
      };
    })
    .filter((t) => t.title)
    .slice(0, 30);
}

/** APIキー未設定・失敗時の簡易整形（同じ見出し構成でそのまま貼る） */
function fallbackResult(input: MinutesInput): MinutesResult {
  const markdown =
    `## 会議の概要\n` +
    `- 会議名：${input.meetingName}\n- 日付：${input.dateLabel}\n- 参加者：${input.participants || "（未記入）"}\n\n` +
    `## 決まったこと\n（メモから整理してください）\n\n` +
    `## 話し合った内容\n${input.rawNotes || "（メモがありません）"}\n\n` +
    `## ネクストアクション\n| タスク | 担当 | 期限 |\n| --- | --- | --- |\n|  |  |  |\n\n` +
    `## 次回までに / 申し送り\n\n` +
    `> ※ AI整形は未設定です（ANTHROPIC_API_KEYを設定すると、要点整理とタスク割りを自動で行います）。`;
  return { markdown, tasks: [], ai: false };
}
