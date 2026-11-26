"use server";

// 依頼21：Claude のコネクタからの「データを読む許可」。代表（「Claudeからアプリのデータを読める」の権限を持つ人）だけが許可できる。
// 戻り先・PKCE などは画面に埋めた値を信じず、ここでもう一度確かめる。

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { canUseMcp, getClient, getMcpSettings, isAllowedRedirect, issueCode, MCP_SCOPE } from "@/lib/mcp/oauth";

function withParams(uri: string, params: Record<string, string>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

function selfUrl(fd: FormData, error: string): string {
  const q = new URLSearchParams();
  for (const k of ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    const v = String(fd.get(k) ?? "");
    if (v) q.set(k, v);
  }
  q.set("response_type", "code");
  q.set("error", error);
  return `/oauth/authorize?${q.toString()}`;
}

export async function decideAuthorizeAction(fd: FormData): Promise<void> {
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const state = String(fd.get("state") ?? "");
  const challenge = String(fd.get("code_challenge") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const db = getDataStore();
  const client = await getClient(clientId);
  const settings = await getMcpSettings(db);
  // 戻り先が確かめられないときは、どこにも戻さない
  if (!client || !client.redirectUris.includes(redirectUri) || !isAllowedRedirect(redirectUri, settings.allowedRedirectHosts)) {
    redirect("/oauth/authorize?error=client");
  }
  if (decision !== "approve") redirect(withParams(redirectUri, { error: "access_denied", state }));
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || String(fd.get("code_challenge_method") ?? "") !== "S256") {
    redirect(withParams(redirectUri, { error: "invalid_request", error_description: "PKCE (S256) is required", state }));
  }

  // ログイン中ならその人。ログインしていなければ、この画面で入れたIDとパスワード
  let staffId = "";
  const session = await getSession();
  const loginId = String(fd.get("login_id") ?? "").trim();
  if (loginId) {
    const staff = await db.getStaffByLoginId(loginId);
    if (!staff || !staff.isActive || !verifyPassword(String(fd.get("password") ?? ""), staff.passwordHash)) redirect(selfUrl(fd, "login"));
    staffId = staff.id;
  } else if (session) {
    staffId = session.staffId;
  } else {
    redirect(selfUrl(fd, "login"));
  }
  const staff = await db.getStaff(staffId);
  if (!(await canUseMcp(staff))) redirect(selfUrl(fd, "permission"));

  const code = await issueCode({ clientId, staffId, redirectUri, codeChallenge: challenge, scope: MCP_SCOPE });
  await fx()
    .mcpAccessLogs.insert({ staffId, clientName: client.clientName, method: "authorize", tool: "", args: {}, ok: true, note: "接続を許可しました" })
    .catch(() => undefined);
  redirect(withParams(redirectUri, { code, state }));
}
