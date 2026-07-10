// 議事録のAI整形（Anthropic Messages API）。
// 生の議事メモを、決められたルール（見やすい構成＋タスク整理）に沿ってMarkdownへ整える。
// ANTHROPIC_API_KEY 未設定時は、簡易テンプレートで整形して返す（デモでも動く）。

import { env, isAnthropicConfigured } from "@/lib/env";

export interface MinutesInput {
  meetingName: string; // 会議名（種類・題名）
  dateLabel: string; // 日付ラベル
  participants: string; // 参加者（カンマ区切り等）
  agenda: string; // アジェンダ（議題）
  rawNotes: string; // 当日の生メモ
}

// 議事録のルール（プロンプト）。見やすい構成・タスク整理（誰が・何を・いつまでに）を必須にする。
const SYSTEM_RULES = `あなたは美容室「ENi」の議事録アシスタントです。会議の生メモを、読みやすく整った議事録（Markdown）に整えます。次のルールに必ず従ってください。

# 出力ルール
- 日本語。Markdownのみを出力し、前置きや後書きは書かない。
- 見出しは「##」を使い、次の順序で構成する：
  ## 会議の概要（会議名・日付・参加者を箇条書き）
  ## 決まったこと（決定事項を箇条書き。無ければ「特になし」）
  ## 話し合った内容（要点を簡潔な箇条書きで。冗長にしない）
  ## ネクストアクション（下記の表を必ず作る）
  ## 次回までに / 申し送り（任意）
- 「ネクストアクション」は必ず次のMarkdown表にする（担当が不明なら「未定」、期限が無ければ「未定」）：
  | タスク | 担当 | 期限 |
  | --- | --- | --- |
- 誰が・何を・いつまでにが一目でわかるように、タスクは動詞から始める短い文にする。
- 生メモに無い事実を創作しない。不明点は「（要確認）」と明記する。
- 太字（**）や箇条書きを活用し、ぱっと見て把握できる構成にする。`;

/** 生メモ → 整形済み議事録（Markdown） */
export async function generateMinutes(input: MinutesInput): Promise<{ markdown: string; ai: boolean }> {
  if (!isAnthropicConfigured()) {
    return { markdown: fallbackMarkdown(input), ai: false };
  }

  const userContent =
    `会議名：${input.meetingName}\n日付：${input.dateLabel}\n参加者：${input.participants || "（未記入）"}\n` +
    `アジェンダ：\n${input.agenda || "（なし）"}\n\n--- 当日の生メモ ---\n${input.rawNotes}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: 2000,
        system: SYSTEM_RULES,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!res.ok) {
      console.error(`[anthropic] 議事録生成に失敗: ${res.status} ${await res.text()}`);
      return { markdown: fallbackMarkdown(input), ai: false };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return text ? { markdown: text, ai: true } : { markdown: fallbackMarkdown(input), ai: false };
  } catch (e) {
    console.error("[anthropic] 議事録生成エラー:", e);
    return { markdown: fallbackMarkdown(input), ai: false };
  }
}

/** APIキー未設定・失敗時の簡易整形（同じ見出し構成でそのまま貼る） */
function fallbackMarkdown(input: MinutesInput): string {
  return (
    `## 会議の概要\n` +
    `- 会議名：${input.meetingName}\n- 日付：${input.dateLabel}\n- 参加者：${input.participants || "（未記入）"}\n\n` +
    `## 決まったこと\n（メモから整理してください）\n\n` +
    `## 話し合った内容\n${input.rawNotes || "（メモがありません）"}\n\n` +
    `## ネクストアクション\n| タスク | 担当 | 期限 |\n| --- | --- | --- |\n|  |  |  |\n\n` +
    `## 次回までに / 申し送り\n\n` +
    `> ※ AI整形は未設定です（ANTHROPIC_API_KEYを設定すると、要点整理とタスク割りを自動で行います）。`
  );
}
