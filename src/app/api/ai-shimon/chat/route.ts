// AIしもん：相談文を受け取り、Claude の返答をストリーミング（SSE）で返す。
// 画面が扱いやすいように、Anthropic のイベントを {t:"文字"} の形に詰め替えて流す（現行Web版と同じ形式）。
// 知識ファイル・APIキーはこのサーバー側でだけ扱い、クライアントには返答文字だけを返す。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { env, isAnthropicConfigured } from "@/lib/env";
import { RANK_LABEL } from "@/lib/eni/forms";
import { buildSystemBlocks, isPromptAvailable, type ChatTurn } from "@/lib/ai-shimon/prompt";

export const dynamic = "force-dynamic";
// 返答は短いが、ストリーミング中に切れないよう余裕を持たせる（Vercelの既定は短い）
export const maxDuration = 60;

const MAX_TOKENS = 1024;
const MAX_TURNS = 30;
const MAX_CHARS = 8000;

/** 画面向けのSSE 1行 */
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** エラーをSSEの形で返す（画面側は通常の返答と同じ経路で表示できる） */
function sseError(message: string, status = 200): Response {
  return new Response(sse({ error: message }) + "data: [DONE]\n\n", {
    status,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-store" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未ログインです" }, { status: 401 });

  if (!isAnthropicConfigured() || !isPromptAvailable()) {
    return sseError("AIしもんはまだ準備中です（管理者がAPIキーとプロンプトを設定すると使えるようになります）");
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  // 会話履歴の検証：user/assistant のテキストだけ、直近 MAX_TURNS 件、1件 MAX_CHARS 文字まで
  let turns: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatTurn =>
        typeof m === "object" &&
        m !== null &&
        ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string" &&
        (m as ChatTurn).content.trim() !== ""
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (turns[0]?.role !== "user") turns = turns.slice(1);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ error: "相談内容を入力してください" }, { status: 400 });
  }

  // 相談者の立場（職種・ランク）。トーンの参考にだけ使う
  const me = await getDataStore().getStaff(session.staffId);
  const roleLabel =
    me?.jobType === "stylist"
      ? "スタイリスト"
      : me?.jobType === "assistant"
        ? `アシスタント${me.rank ? `（${RANK_LABEL[me.rank]}）` : ""}`
        : "";

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const system = buildSystemBlocks(turns, { name: me?.name ?? session.name, roleLabel });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const upstream = client.messages.stream({
          model: env.aiShimonModel,
          max_tokens: MAX_TOKENS,
          system,
          messages: turns.map((t) => ({ role: t.role, content: t.content })),
        });
        for await (const event of upstream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(sse({ t: event.delta.text })));
          }
        }
      } catch (e) {
        // 本文・知識ファイルの内容はログに残さない（エラー種別だけ）
        console.error(`[ai-shimon] ${e instanceof Error ? e.message : "unknown error"}`);
        controller.enqueue(encoder.encode(sse({ error: "ごめん、いまうまく返せなかった。もう一回送ってもらえる？" })));
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      "x-accel-buffering": "no",
    },
  });
}
