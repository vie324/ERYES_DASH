// 依頼21：中さんのClaudeから読む MCP サーバー（読むだけ・代表だけ・お客様の情報は返さない）
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import {
  exchangeCode,
  isAllowedRedirect,
  issueCode,
  issueStaticToken,
  refreshTokens,
  registerClient,
  revokeToken,
  s256,
  sha256,
  verifyBearer,
} from "@/lib/mcp/oauth";
import { handleMcpMessage, negotiateVersion } from "@/lib/mcp/server";
import { TOOLS } from "@/lib/mcp/tools";

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "a".repeat(20) + "-verifier-" + "b".repeat(30);

async function connect(staffId = "staff-admin") {
  const db = getMockStore();
  const { client } = await registerClient(db, { redirect_uris: [CALLBACK], client_name: "Claude" });
  const code = await issueCode({ clientId: client.clientId, staffId, redirectUri: CALLBACK, codeChallenge: s256(VERIFIER), scope: "mcp:read" });
  return { db, client, code };
}

describe("つなぐ（OAuth）", () => {
  it("戻り先は決めた相手（claude.ai など）と手元のPCだけ", () => {
    const hosts = ["claude.ai", "claude.com"];
    expect(isAllowedRedirect(CALLBACK, hosts)).toBe(true);
    expect(isAllowedRedirect("http://localhost:6274/oauth/callback", hosts)).toBe(true);
    expect(isAllowedRedirect("https://evil.example.com/cb", hosts)).toBe(false);
    expect(isAllowedRedirect("http://claude.ai/cb", hosts)).toBe(false);
    expect(isAllowedRedirect("https://claude.ai.evil.example/cb", hosts)).toBe(false);
  });

  it("知らない戻り先では登録できない", async () => {
    await expect(registerClient(getMockStore(), { redirect_uris: ["https://evil.example.com/cb"] })).rejects.toThrow();
  });

  it("代表が許可すると、PKCE を確かめてトークンが出る。コードは1回だけ・リフレッシュは入れ替え", async () => {
    const { client, code } = await connect();
    await expect(exchangeCode({ code, clientId: client.clientId, redirectUri: CALLBACK, codeVerifier: "wrong-verifier-wrong-verifier-wrong-verifier" })).rejects.toThrow();
    // 失敗したコードは使い切り扱い（同じコードで2回目は通らない）
    await expect(exchangeCode({ code, clientId: client.clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER })).rejects.toThrow();

    const second = await connect();
    const tokens = await exchangeCode({ code: second.code, clientId: second.client.clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER });
    expect(tokens.token_type).toBe("Bearer");
    const auth = await verifyBearer(`Bearer ${tokens.access_token}`);
    expect(auth?.staff.id).toBe("staff-admin");
    // 保存しているのはハッシュだけ
    expect(await fx().oauthTokens.find({ tokenHash: tokens.access_token })).toBeNull();
    expect(await fx().oauthTokens.find({ tokenHash: sha256(tokens.access_token) })).not.toBeNull();
    // リフレッシュトークンでは MCP を呼べない
    expect(await verifyBearer(`Bearer ${tokens.refresh_token}`)).toBeNull();

    const next = await refreshTokens({ refreshToken: tokens.refresh_token, clientId: second.client.clientId });
    expect(next.access_token).not.toBe(tokens.access_token);
    await expect(refreshTokens({ refreshToken: tokens.refresh_token, clientId: second.client.clientId })).rejects.toThrow();
  });

  it("代表でない人のコードからはトークンが出ない", async () => {
    const { client, code } = await connect("staff-3");
    await expect(exchangeCode({ code, clientId: client.clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER })).rejects.toThrow(/使えません/);
  });

  it("秘密のトークン（ヘッダー）も使え、止めると使えない", async () => {
    const token = await issueStaticToken("staff-admin", "テスト");
    const auth = await verifyBearer(`Bearer ${token}`);
    expect(auth?.clientName).toContain("テスト");
    await revokeToken(auth!.token.id);
    expect(await verifyBearer(`Bearer ${token}`)).toBeNull();
    expect(await verifyBearer(null)).toBeNull();
  });
});

describe("MCP のやりとり（読むだけ）", () => {
  async function auth() {
    const token = await issueStaticToken("staff-admin", "MCPテスト");
    return (await verifyBearer(`Bearer ${token}`))!;
  }

  it("initialize・tools/list・通知", async () => {
    const db = getMockStore();
    const a = await auth();
    const init = await handleMcpMessage(db, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "claude-ai" } } }, a);
    expect((init?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
    expect(negotiateVersion("1999-01-01")).toBe("2025-11-25");
    expect(await handleMcpMessage(db, { jsonrpc: "2.0", method: "notifications/initialized" }, a)).toBeNull();
    const list = await handleMcpMessage(db, { jsonrpc: "2.0", id: 2, method: "tools/list" }, a);
    const tools = (list?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
    const unknown = await handleMcpMessage(db, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "delete_everything" } }, a);
    expect(unknown?.error?.code).toBe(-32602);
  });

  it("どのツールも動き、ログインID・パスワード・お客様の情報を返さない。呼んだ記録が残る", async () => {
    const db = getMockStore();
    const a = await auth();
    const customers = await db.listCustomers?.().catch(() => []);
    for (const t of TOOLS) {
      const res = await handleMcpMessage(db, { jsonrpc: "2.0", id: t.name, method: "tools/call", params: { name: t.name, arguments: {} } }, a);
      const result = res?.result as { content: { text: string }[]; isError: boolean };
      expect(result.isError, `${t.name}: ${result.content[0].text}`).toBe(false);
      const text = result.content[0].text;
      expect(text).not.toMatch(/passwordHash|password_hash|loginId|login_id|lineUserId|phone/);
      for (const c of (customers ?? []).slice(0, 20)) if (c.fullName) expect(text).not.toContain(c.fullName);
    }
    const sales = await handleMcpMessage(db, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_sales_trend", arguments: { months: 2, by_staff: true } } }, a);
    expect((sales?.result as { content: { text: string }[] }).content[0].text).toContain("by_staff_last_month");
    const bad = await handleMcpMessage(db, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "get_utilization", arguments: { month: "2026/1" } } }, a);
    expect((bad?.result as { isError: boolean }).isError).toBe(true);
    const logs = await fx().mcpAccessLogs.list({ where: { method: "tools/call" } });
    expect(logs.length).toBeGreaterThanOrEqual(TOOLS.length);
    expect(logs.some((l) => !l.ok)).toBe(true);
  });
});
