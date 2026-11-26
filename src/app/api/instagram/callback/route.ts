// 依頼22：Instagramの許可の画面からの戻り先。長期トークンに替えて暗号化して保存し、最初の数字を集める。
// ホーム画面に追加したアプリから開くと、Instagramの画面が別の窓で開くことがあるので、
// 本人の確かめは署名つきの合言葉（state）で行い、終わったら「アプリに戻ってください」の画面を出す。

import { NextRequest } from "next/server";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { addDays, todayJst } from "@/lib/date";
import { encryptToken, exchangeCode, fetchProfile, getInstagramSettings, isInstagramConfigured, isProfessional, readState, syncAccount } from "@/lib/instagram";
import { publicOrigin } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, body: string, ok: boolean): Response {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;background:#faf8f2;color:#2b2622;margin:0;padding:48px 20px calc(48px + env(safe-area-inset-bottom))}
.card{max-width:360px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.7;color:#5c534b}
a{display:block;margin-top:16px;text-align:center;background:${ok ? "#8a6d3b" : "#5c534b"};color:#fff;border-radius:14px;padding:14px;text-decoration:none;font-weight:700}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p><a href="/staff/instagram">アプリのInstagramの画面を開く</a></div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return page("つなぐのをやめました", "Instagramの画面で許可されませんでした。もう一度つなぐときは、アプリのInstagramの画面から始めてください。", false);
  const staffId = readState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code") ?? "";
  if (!staffId || !code) return page("つなげませんでした", "時間がたちすぎたか、確かめの情報が正しくありません。アプリのInstagramの画面から、もう一度つないでください。", false);
  if (!isInstagramConfigured()) return page("つなげませんでした", "Instagramの連携の準備がまだです。管理者に連絡してください。", false);
  const db = getDataStore();
  const f = fx();
  try {
    const redirectUri = `${publicOrigin(req)}/api/instagram/callback`;
    const { token, userId, expiresIn } = await exchangeCode(code, redirectUri);
    const settings = await getInstagramSettings(db);
    const profile = await fetchProfile(token, settings.graphVersion);
    if (!isProfessional(profile.accountType)) {
      return page("プロアカウントに切り替えてください", "Instagramのアプリの「設定 → アカウントの種類とツール → プロアカウントに切り替える」で、クリエイターかビジネスにしてから、もう一度つないでください。", false);
    }
    const igUserId = userId || profile.userId;
    const taken = await f.instagramAccounts.find({ igUserId });
    if (taken && taken.staffId !== staffId) return page("つなげませんでした", "このInstagramのアカウントは、ほかのスタッフがつないでいます。", false);
    const row = {
      staffId,
      igUserId,
      username: profile.username,
      accountType: profile.accountType,
      tokenEnc: encryptToken(token),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      tokenRefreshedAt: new Date(),
      status: "active" as const,
      lastError: "",
      connectedAt: new Date(),
    };
    const existing = taken ?? (await f.instagramAccounts.find({ staffId }));
    const acc = existing ? await f.instagramAccounts.update(existing.id, row) : await f.instagramAccounts.insert(row);
    if (acc) await syncAccount(db, acc, addDays(todayJst(), -1)).catch(() => "error");
    return page("Instagramをつなぎました", `@${profile.username} をつなぎました。毎朝、前の日の数字を集めます。`, true);
  } catch (e) {
    console.error(`[instagram] つなげませんでした: ${e instanceof Error ? e.message : String(e)}`);
    return page("つなげませんでした", "Instagramとのやりとりに失敗しました。少し時間をおいて、もう一度つないでください。", false);
  }
}
