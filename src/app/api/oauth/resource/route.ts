// 依頼21：保護されたリソースの情報（RFC 9728）。/.well-known/oauth-protected-resource から書き換えでここに来る。

import { NextRequest } from "next/server";
import { MCP_SCOPE } from "@/lib/mcp/oauth";
import { CORS_HEADERS, jsonResponse, publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const origin = publicOrigin(req);
  return jsonResponse({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "ENiスタッフアプリ（読み取り専用）",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
