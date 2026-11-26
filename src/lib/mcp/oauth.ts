// 依頼21：中さんのClaude（カスタムコネクタ）から、このアプリのデータを読むための認可（OAuth 2.1）。
//  ・Claude がクライアントとして自分を登録し（動的クライアント登録）、中さんがこのアプリにログインして「許可」すると、
//    認可コード（PKCE必須）→ アクセストークン（1時間）＋ リフレッシュトークン（30日・使うたびに入れ替え）が出る
//  ・OAuth を使えないクライアント（Claude Code・APIのMCPコネクタなど）向けに、管理画面で発行する長い秘密のトークン
//    （Authorization: Bearer で送る）も使える
//  ・トークンはハッシュだけを保存する。使えるのは「Claudeからアプリのデータを読める」（代表だけ）の権限を持つ人だけ
//  ・戻り先（redirect_uri）は、決めた相手（claude.ai／claude.com／手元のPC）だけに絞る（管理画面で足せる）

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fx } from "@/lib/data/tables";
import type { OauthClient, OauthToken } from "@/lib/data/tables";
import { getDataStore } from "@/lib/data";
import { staffHasPermission } from "@/lib/permissions";
import { readJsonSetting } from "@/lib/feature-settings";
import type { DataStore, Staff } from "@/lib/data/types";

export const MCP_SCOPE = "mcp:read";
export const ACCESS_TTL_SEC = 3600;
export const REFRESH_TTL_SEC = 30 * 24 * 3600;
const CODE_TTL_SEC = 600;

export interface McpSettings {
  /** 戻り先として許すホスト（https）。localhost・127.0.0.1 は http も許す */
  allowedRedirectHosts: string[];
}
export const MCP_SETTINGS_KEY = "mcp_settings";
export const DEFAULT_MCP_SETTINGS: McpSettings = { allowedRedirectHosts: ["claude.ai", "claude.com"] };

export async function getMcpSettings(db: DataStore): Promise<McpSettings> {
  const s = await readJsonSetting(db, MCP_SETTINGS_KEY, DEFAULT_MCP_SETTINGS);
  return { allowedRedirectHosts: Array.isArray(s.allowedRedirectHosts) ? s.allowedRedirectHosts.map(String) : DEFAULT_MCP_SETTINGS.allowedRedirectHosts };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 戻り先として許すか（https で決めたホスト、または手元のPC） */
export function isAllowedRedirect(uri: string, hosts: string[]): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (local) return u.protocol === "http:" || u.protocol === "https:";
  return u.protocol === "https:" && hosts.map((h) => h.trim().toLowerCase()).includes(u.hostname.toLowerCase());
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- 動的クライアント登録（RFC 7591）

export async function registerClient(
  db: DataStore,
  input: { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown }
): Promise<{ client: OauthClient; secret: string | null }> {
  const settings = await getMcpSettings(db);
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String).filter(Boolean) : [];
  if (uris.length === 0 || uris.length > 10) throw new OAuthError("invalid_redirect_uri", "redirect_uris を1〜10個指定してください");
  for (const u of uris) {
    if (!isAllowedRedirect(u, settings.allowedRedirectHosts)) throw new OAuthError("invalid_redirect_uri", `この戻り先は使えません: ${u}`);
  }
  // 登録の乱用を防ぐ（1時間に20件まで）
  const recent = await fx().oauthClients.count({ createdAt: { gte: new Date(Date.now() - 3600_000) } });
  if (recent >= 20) throw new OAuthError("temporarily_unavailable", "登録が多すぎます。しばらくしてからお試しください", 429);
  const method = String(input.token_endpoint_auth_method ?? "none");
  const authMethod = method === "client_secret_post" || method === "client_secret_basic" ? method : "none";
  const secret = authMethod === "none" ? null : randomToken(32);
  const client = await fx().oauthClients.insert({
    clientId: `eni-${randomToken(18)}`,
    clientName: String(input.client_name ?? "Claude").slice(0, 100) || "Claude",
    redirectUris: uris,
    authMethod,
    secretHash: secret ? sha256(secret) : "",
  });
  return { client, secret };
}

export async function getClient(clientId: string): Promise<OauthClient | null> {
  if (!clientId) return null;
  return fx().oauthClients.find({ clientId });
}

/** トークンの受け取り口で、クライアントの秘密を確かめる（公開クライアントは PKCE だけ） */
export function verifyClientSecret(client: OauthClient, presented: string | null): boolean {
  if (client.authMethod === "none" || !client.secretHash) return true;
  return Boolean(presented) && safeEqual(sha256(presented!), client.secretHash);
}

// ---------------------------------------------------------------- 認可コード（PKCE S256 必須）

export async function canUseMcp(staff: Staff | null): Promise<boolean> {
  return staffHasPermission(staff, "mcp_read");
}

export async function issueCode(input: { clientId: string; staffId: string; redirectUri: string; codeChallenge: string; scope: string }): Promise<string> {
  const code = randomToken(32);
  await fx().oauthCodes.insert({
    codeHash: sha256(code),
    clientId: input.clientId,
    staffId: input.staffId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope || MCP_SCOPE,
    expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
    usedAt: null,
  });
  return code;
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface TokenSet {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokenPair(clientId: string, staffId: string, scope: string): Promise<TokenSet> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  const f = fx();
  await f.oauthTokens.insertMany([
    { tokenHash: sha256(access), kind: "access", clientId, staffId, scope, label: "", expiresAt: new Date(Date.now() + ACCESS_TTL_SEC * 1000), revokedAt: null, lastUsedAt: null },
    { tokenHash: sha256(refresh), kind: "refresh", clientId, staffId, scope, label: "", expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000), revokedAt: null, lastUsedAt: null },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope };
}

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenSet> {
  const f = fx();
  const row = input.code ? await f.oauthCodes.find({ codeHash: sha256(input.code) }) : null;
  if (!row || row.usedAt || !row.expiresAt || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "認可コードが正しくないか、期限が切れています");
  // 一度だけ使える（同じコードがもう一度来たら、そのコードから出たトークンも止める）
  await f.oauthCodes.update(row.id, { usedAt: new Date() });
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "クライアントが違います");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri が違います");
  if (!input.codeVerifier || !safeEqual(s256(input.codeVerifier), row.codeChallenge)) throw new OAuthError("invalid_grant", "code_verifier が正しくありません");
  const staff = await getDataStore().getStaff(row.staffId);
  if (!(await canUseMcp(staff))) throw new OAuthError("access_denied", "このアカウントでは使えません", 403);
  return issueTokenPair(row.clientId, row.staffId, row.scope);
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }): Promise<TokenSet> {
  const f = fx();
  const row = input.refreshToken ? await f.oauthTokens.find({ tokenHash: sha256(input.refreshToken), kind: "refresh" }) : null;
  if (!row || row.revokedAt || !row.expiresAt || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "リフレッシュトークンが正しくないか、期限が切れています");
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "クライアントが違います");
  const staff = await getDataStore().getStaff(row.staffId);
  if (!(await canUseMcp(staff))) throw new OAuthError("access_denied", "このアカウントでは使えません", 403);
  await f.oauthTokens.update(row.id, { revokedAt: new Date() });
  return issueTokenPair(row.clientId, row.staffId, row.scope);
}

// ---------------------------------------------------------------- 管理画面で発行する秘密のトークン（OAuth を使えないとき）

export async function issueStaticToken(staffId: string, label: string): Promise<string> {
  const token = `eni_mcp_${randomToken(32)}`;
  await fx().oauthTokens.insert({
    tokenHash: sha256(token),
    kind: "static",
    clientId: "static",
    staffId,
    scope: MCP_SCOPE,
    label: label.slice(0, 60) || "秘密のトークン",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
  });
  return token;
}

/** トークンを止める（その人のもの、または管理者が） */
export async function revokeToken(id: string): Promise<void> {
  await fx().oauthTokens.update(id, { revokedAt: new Date() });
}

/** あるクライアントへの許可をまとめて取り消す（アクセス・リフレッシュの両方） */
export async function revokeClientGrants(clientId: string, staffId: string): Promise<number> {
  return fx().oauthTokens.updateWhere({ clientId, staffId, revokedAt: { isNull: true } }, { revokedAt: new Date() });
}

// ---------------------------------------------------------------- MCP の入口でトークンを確かめる

export interface McpAuth {
  staff: Staff;
  token: OauthToken;
  clientName: string;
}

export async function verifyBearer(header: string | null): Promise<McpAuth | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m) return null;
  const f = fx();
  const row = await f.oauthTokens.find({ tokenHash: sha256(m[1]) });
  if (!row || row.kind === "refresh" || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  const staff = await getDataStore().getStaff(row.staffId);
  if (!staff || !(await canUseMcp(staff))) return null;
  // 最後に使った時刻（10分に1回だけ書く）
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 600_000) {
    await f.oauthTokens.update(row.id, { lastUsedAt: new Date() }).catch(() => undefined);
  }
  const client = row.kind === "static" ? null : await getClient(row.clientId);
  return { staff, token: row, clientName: row.kind === "static" ? `秘密のトークン（${row.label}）` : (client?.clientName ?? "Claude") };
}
