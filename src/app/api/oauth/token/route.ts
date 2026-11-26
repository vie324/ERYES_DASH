// 依頼21：トークンの受け取り口。認可コード（PKCE必須）→ アクセストークン、リフレッシュトークン → 入れ替え。

import { NextRequest } from "next/server";
import { OAuthError, exchangeCode, getClient, refreshTokens, verifyClientSecret } from "@/lib/mcp/oauth";
import { CORS_HEADERS, jsonResponse, publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  }
  return new URLSearchParams(await req.text());
}

function basicAuth(header: string | null): { id: string; secret: string } | null {
  const m = /^Basic\s+(.+)$/i.exec(header ?? "");
  if (!m) return null;
  const [id, ...rest] = Buffer.from(m[1], "base64").toString("utf8").split(":");
  return { id: decodeURIComponent(id ?? ""), secret: decodeURIComponent(rest.join(":")) };
}

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

export async function POST(req: NextRequest): Promise<Response> {
  const p = await readParams(req);
  const basic = basicAuth(req.headers.get("authorization"));
  const clientId = basic?.id || p.get("client_id") || "";
  const client = await getClient(clientId);
  if (!client || !verifyClientSecret(client, basic?.secret ?? p.get("client_secret"))) {
    return jsonResponse({ error: "invalid_client", error_description: "クライアントを確かめられませんでした" }, 401, NO_STORE);
  }
  const resource = p.get("resource");
  if (resource && !resource.startsWith(publicOrigin(req))) {
    return jsonResponse({ error: "invalid_target", error_description: "resource が違います" }, 400, NO_STORE);
  }
  try {
    const grant = p.get("grant_type");
    if (grant === "authorization_code") {
      const tokens = await exchangeCode({ code: p.get("code") ?? "", clientId, redirectUri: p.get("redirect_uri") ?? "", codeVerifier: p.get("code_verifier") ?? "" });
      return jsonResponse(tokens, 200, NO_STORE);
    }
    if (grant === "refresh_token") {
      const tokens = await refreshTokens({ refreshToken: p.get("refresh_token") ?? "", clientId });
      return jsonResponse(tokens, 200, NO_STORE);
    }
    return jsonResponse({ error: "unsupported_grant_type", error_description: "authorization_code と refresh_token だけです" }, 400, NO_STORE);
  } catch (e) {
    if (e instanceof OAuthError) return jsonResponse({ error: e.code, error_description: e.message }, e.status === 403 ? 400 : e.status, NO_STORE);
    console.error(`[oauth] トークンを出せませんでした: ${e instanceof Error ? e.message : String(e)}`);
    return jsonResponse({ error: "server_error" }, 500, NO_STORE);
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
