// 依頼21：中さんのClaude（カスタムコネクタ）から読む MCP サーバー。コネクタに登録するURLは「https://（このアプリ）/api/mcp」。
// トークンが無い・正しくないときは 401 と、認可の案内（WWW-Authenticate の resource_metadata）を返す。

import { NextRequest } from "next/server";
import { getDataStore } from "@/lib/data";
import { verifyBearer } from "@/lib/mcp/oauth";
import { CORS_HEADERS, handleMcpMessage, jsonResponse, publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized(req: NextRequest, hadToken: boolean): Response {
  const origin = publicOrigin(req);
  const challenge = `Bearer realm="ENi", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"${hadToken ? ', error="invalid_token"' : ""}, scope="mcp:read"`;
  return jsonResponse(
    { error: hadToken ? "invalid_token" : "unauthorized", error_description: "このアプリの代表のアカウントで許可（ログイン）してください" },
    401,
    { "www-authenticate": challenge }
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const header = req.headers.get("authorization");
  const auth = await verifyBearer(header);
  if (!auth) return unauthorized(req, Boolean(header));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const db = getDataStore();
  if (Array.isArray(body)) {
    if (body.length === 0) return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    const out = (await Promise.all(body.map((m) => handleMcpMessage(db, m, auth)))).filter(Boolean);
    return out.length ? jsonResponse(out) : new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  const res = await handleMcpMessage(db, body, auth);
  return res ? jsonResponse(res) : new Response(null, { status: 202, headers: CORS_HEADERS });
}

// 状態を持たない形なので、SSE の常時接続（GET）とセッションの終了（DELETE）は使わない
export async function GET(): Promise<Response> {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS", ...CORS_HEADERS } });
}

export async function DELETE(): Promise<Response> {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS", ...CORS_HEADERS } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
