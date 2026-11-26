// 依頼21：動的クライアント登録（RFC 7591）。Claude がコネクタを追加するときに、自分を登録しに来る。
// 戻り先（redirect_uris）は、決めた相手（管理画面の設定）だけを受け付ける。

import { NextRequest } from "next/server";
import { getDataStore } from "@/lib/data";
import { OAuthError, registerClient } from "@/lib/mcp/oauth";
import { CORS_HEADERS, jsonResponse } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_client_metadata", error_description: "JSONで送ってください" }, 400);
  }
  try {
    const { client, secret } = await registerClient(getDataStore(), body);
    return jsonResponse(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: client.authMethod,
        scope: "mcp:read",
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      },
      201
    );
  } catch (e) {
    if (e instanceof OAuthError) return jsonResponse({ error: e.code, error_description: e.message }, e.status);
    console.error(`[oauth] 登録に失敗: ${e instanceof Error ? e.message : String(e)}`);
    return jsonResponse({ error: "server_error", error_description: "登録できませんでした" }, 500);
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
