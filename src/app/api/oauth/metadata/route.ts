// 依頼21：認可サーバーの情報（RFC 8414）。/.well-known/oauth-authorization-server から書き換えでここに来る。

import { NextRequest } from "next/server";
import { MCP_SCOPE } from "@/lib/mcp/oauth";
import { CORS_HEADERS, jsonResponse, publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const origin = publicOrigin(req);
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [MCP_SCOPE],
    service_documentation: `${origin}/admin/mcp`,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
