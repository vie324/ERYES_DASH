// 依頼21：MCP（Model Context Protocol）の受け口。Streamable HTTP の「状態を持たない」形で、
// POST で届く JSON-RPC にその場で JSON で返す（SSE の常時接続は使わない）。
// 読むだけのツール（lib/mcp/tools.ts）だけを出す。呼ばれたツール・引数・成否は mcp_access_logs に残す。

import { fx } from "@/lib/data/tables";
import { TOOLS, toolByName } from "./tools";
import type { McpAuth } from "./oauth";
import type { DataStore } from "@/lib/data/types";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "eni-staff-app", title: "ENiスタッフアプリ（読み取り専用）", version: "1.0.0" };

const INSTRUCTIONS = [
  "株式会社ENi（ヘアサロン「ENi」とアイラッシュサロン「イーリス（EREYS）」）のスタッフアプリのデータを読むためのサーバーです。",
  "読むだけで、書き込み・送信はできません。返すのはスタッフの名前・役割と、売上・練習時間・稼働率・日報の提出・ルーティン業務・目標の数字です。",
  "お客様の個人情報や、日報の文章は返しません。数字はスタッフがアプリに入れたものの集計で、会計システム（SalonOne）の確定値ではありません。",
].join("\n");

type Id = string | number | null;
interface RpcMessage {
  jsonrpc?: unknown;
  id?: Id;
  method?: unknown;
  params?: Record<string, unknown>;
}
export interface RpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

async function log(auth: McpAuth, method: string, tool: string, args: Record<string, unknown>, success: boolean, note: string) {
  try {
    const text = JSON.stringify(args ?? {});
    await fx().mcpAccessLogs.insert({
      staffId: auth.staff.id,
      clientName: auth.clientName.slice(0, 100),
      method,
      tool,
      args: text.length > 2000 ? { truncated: text.slice(0, 2000) } : (args ?? {}),
      ok: success,
      note: note.slice(0, 500),
    });
  } catch {
    // 記録に失敗しても、読み取りは止めない
  }
}

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
}

/** 1つのメッセージを処理する（通知には null を返す＝返事なし） */
export async function handleMcpMessage(db: DataStore, raw: unknown, auth: McpAuth): Promise<RpcResponse | null> {
  const msg = (raw ?? {}) as RpcMessage;
  const id: Id = msg.id === undefined ? null : msg.id;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(id, -32600, "Invalid Request");
  const method = msg.method;
  const isNotification = msg.id === undefined;
  if (isNotification) return null; // notifications/initialized・notifications/cancelled など

  switch (method) {
    case "initialize": {
      await log(auth, "initialize", "", {}, true, String((msg.params?.clientInfo as { name?: string } | undefined)?.name ?? ""));
      return ok(id, {
        protocolVersion: negotiateVersion(msg.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Record<string, unknown>;
      const tool = toolByName(name);
      if (!tool) {
        await log(auth, "tools/call", name, args, false, "ないツール");
        return fail(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const data = await tool.run(db, args);
        await log(auth, "tools/call", name, args, true, "");
        return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await log(auth, "tools/call", name, args, false, message);
        return ok(id, { content: [{ type: "text", text: `読み取れませんでした：${message}` }], isError: true });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

/** このアプリの公開URL（Vercel の前段が付けるヘッダーから。プレビューでも、そのURLのまま動くように） */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
  "access-control-max-age": "86400",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS_HEADERS, ...extra },
  });
}
