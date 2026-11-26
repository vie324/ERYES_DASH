"use server";

// 依頼21：Claude（MCP）からの読み取りの管理。秘密のトークンを出せるのは「Claudeからアプリのデータを読める」の権限を持つ人（代表）だけ。
// 止める（取り消す）のは、いざというときのために管理者なら誰でもできる。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { attempt, resultUrl, str, InputError } from "@/lib/action-utils";
import { linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { canUseMcp, issueStaticToken, MCP_SETTINGS_KEY, revokeToken } from "@/lib/mcp/oauth";

const BACK = "/admin/mcp";

/** 秘密のトークンを出す（画面に1回だけ出す。URLには載せない） */
export async function issueStaticTokenAction(label: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const me = await getDataStore().getStaff(session.staffId);
  if (!(await canUseMcp(me))) return { ok: false, error: "秘密のトークンを出せるのは、「Claudeからアプリのデータを読める」の権限を持つ人（代表）だけです" };
  try {
    const token = await issueStaticToken(session.staffId, String(label ?? "").trim() || "Claude");
    await fx()
      .mcpAccessLogs.insert({ staffId: session.staffId, clientName: "管理画面", method: "issue_token", tool: "", args: {}, ok: true, note: `秘密のトークン「${String(label ?? "").slice(0, 60)}」を出しました` })
      .catch(() => undefined);
    revalidatePath(BACK);
    return { ok: true, token };
  } catch {
    return { ok: false, error: "トークンを出せませんでした（データベースの準備がまだかもしれません）" };
  }
}

export async function revokeTokenAction(fd: FormData) {
  const session = await requireAdmin();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    const f = fx();
    const row = await f.oauthTokens.get(id);
    if (!row) throw new InputError("トークンが見つかりません");
    await revokeToken(id);
    // OAuth の許可は、同じクライアントのアクセス・リフレッシュの両方を止める
    if (row.kind !== "static") await f.oauthTokens.updateWhere({ clientId: row.clientId, staffId: row.staffId, revokedAt: { isNull: true } }, { revokedAt: new Date() });
    await f.mcpAccessLogs
      .insert({ staffId: session.staffId, clientName: "管理画面", method: "revoke", tool: "", args: { kind: row.kind }, ok: true, note: row.kind === "static" ? `秘密のトークン「${row.label}」を止めました` : "Claude の接続の許可を取り消しました" })
      .catch(() => undefined);
    return "止めました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}

export async function saveMcpSettingsAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const hosts = linesOf(str(fd, "hosts", 2000), { max: 20, maxLength: 100 })
      .map((h) => h.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((h) => /^[a-z0-9.-]+$/.test(h));
    if (hosts.length === 0) throw new InputError("1つ以上入れてください（claude.ai など）");
    await writeJsonSetting(getDataStore(), MCP_SETTINGS_KEY, { allowedRedirectHosts: hosts });
    return "保存しました";
  });
  revalidatePath(BACK);
  redirect(resultUrl(BACK, r));
}
