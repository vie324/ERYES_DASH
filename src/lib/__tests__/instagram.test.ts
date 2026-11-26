// 依頼22：Instagram（本人がつなぐ・毎日集める・切れたら知らせる）
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.INSTAGRAM_APP_SECRET = "test-app-secret";
});

import { createHmac } from "node:crypto";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { addDays, todayJst } from "@/lib/date";
import { decryptToken, encryptToken, isProfessional, makeState, needsRefresh, readState, summarizeAccounts, syncAccount } from "@/lib/instagram";
import { parseSignedRequest } from "@/lib/instagram/signed-request";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("トークン・合言葉", () => {
  it("トークンは暗号化して保存し、書き換えられたら読めない", () => {
    const enc = encryptToken("IGAA-secret-token");
    expect(enc).not.toContain("IGAA");
    expect(decryptToken(enc)).toBe("IGAA-secret-token");
    expect(decryptToken(enc.slice(0, -2) + "xx")).toBeNull();
  });

  it("つなぐときの合言葉は本人に結びつき、書き換えると通らない", () => {
    const s = makeState("staff-3");
    expect(readState(s)).toBe("staff-3");
    expect(readState(s.replace("staff-3", "staff-4"))).toBeNull();
  });

  it("期限が20日を切ったら更新する（最後の更新から24時間たっていれば）", () => {
    const now = Date.now();
    expect(needsRefresh({ tokenExpiresAt: new Date(now + 50 * 86400_000), tokenRefreshedAt: new Date(now - 2 * 86400_000) }, now)).toBe(false);
    expect(needsRefresh({ tokenExpiresAt: new Date(now + 10 * 86400_000), tokenRefreshedAt: new Date(now - 2 * 86400_000) }, now)).toBe(true);
    expect(needsRefresh({ tokenExpiresAt: new Date(now + 10 * 86400_000), tokenRefreshedAt: new Date(now - 3600_000) }, now)).toBe(false);
    expect(isProfessional("MEDIA_CREATOR")).toBe(true);
    expect(isProfessional("PERSONAL")).toBe(false);
  });

  it("Meta からの signed_request は署名を確かめる", () => {
    const payload = Buffer.from(JSON.stringify({ user_id: "1784", algorithm: "HMAC-SHA256" })).toString("base64url");
    const sig = createHmac("sha256", "test-app-secret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${sig}.${payload}`)?.user_id).toBe("1784");
    expect(parseSignedRequest(`${sig.slice(0, -2)}AA.${payload}`)).toBeNull();
  });
});

function fakeInstagram(handler: (url: URL) => { status?: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const { status = 200, body } = handler(new URL(String(input)));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    })
  );
}

describe("毎日集める", () => {
  it("使えない数字の名前はその数字だけ飛ばし、ほかは保存する", async () => {
    const db = getMockStore();
    const acc = await fx().instagramAccounts.insert({
      staffId: "staff-5",
      igUserId: "ig-5",
      username: "aoi",
      status: "active",
      tokenEnc: encryptToken("tok"),
      tokenExpiresAt: new Date(Date.now() + 50 * 86400_000),
      tokenRefreshedAt: new Date(),
    });
    fakeInstagram((url) => {
      if (url.pathname.endsWith("/me")) return { body: { user_id: "ig-5", username: "aoi", account_type: "MEDIA_CREATOR", followers_count: 321, follows_count: 10, media_count: 5 } };
      if (url.pathname.endsWith("/me/insights")) {
        const metrics = url.searchParams.get("metric")!.split(",");
        if (metrics.includes("old_metric")) return { status: 400, body: { error: { message: "metric[0] must be one of ...", code: 100 } } };
        return { body: { data: metrics.map((m) => ({ name: m, period: "day", total_value: { value: 7 } })) } };
      }
      if (url.pathname.endsWith("/me/media")) return { body: { data: [{ id: "m1", caption: "カットの仕上げ #ENi", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/x", timestamp: "2026-11-20T10:00:00+0000", like_count: 3, comments_count: 1 }] } };
      if (url.pathname.endsWith("/m1/insights")) return { body: { data: [{ name: "views", period: "lifetime", values: [{ value: 99 }] }] } };
      return { status: 404, body: { error: { message: "not found", code: 803 } } };
    });
    await db.setAppSetting("instagram_settings", JSON.stringify({ accountMetrics: ["reach", "old_metric"], mediaMetrics: ["views"] }));
    const date = addDays(todayJst(), -1);
    expect(await syncAccount(db, acc, date)).toBe("ok");
    const day = await fx().instagramDaily.find({ accountId: acc.id, date });
    expect(day?.followers).toBe(321);
    expect(day?.metrics.reach).toBe(7);
    expect(day?.metrics.old_metric).toBeUndefined();
    const media = await fx().instagramMedia.find({ accountId: acc.id, mediaId: "m1" });
    expect(media?.metrics.views).toBe(99);
    expect(media?.mediaType).toBe("REELS");
    expect((await fx().instagramAccounts.get(acc.id))?.lastError).toContain("old_metric");
    await db.setAppSetting("instagram_settings", "");
  });

  it("期限が切れたら『つなぎ直し』にして、本人に1回だけ知らせる", async () => {
    const db = getMockStore();
    const acc = await fx().instagramAccounts.insert({
      staffId: "staff-6",
      igUserId: "ig-6",
      username: "hikari",
      status: "active",
      tokenEnc: encryptToken("tok"),
      tokenExpiresAt: new Date(Date.now() + 50 * 86400_000),
      tokenRefreshedAt: new Date(),
    });
    fakeInstagram(() => ({ status: 400, body: { error: { message: "Error validating access token", type: "OAuthException", code: 190 } } }));
    const before = (await db.listAppNotifications("staff-6", 50)).length;
    expect(await syncAccount(db, acc, addDays(todayJst(), -1))).toBe("expired");
    const again = (await fx().instagramAccounts.get(acc.id))!;
    expect(again.status).toBe("expired");
    await syncAccount(db, again, addDays(todayJst(), -1));
    const after = await db.listAppNotifications("staff-6", 50);
    expect(after.length - before).toBe(1);
    expect(after[0].href).toBe("/staff/instagram");
  });

  it("デモのアカウントは30日分の数字があり、一覧の合計が出る", async () => {
    const accounts = await fx().instagramAccounts.list({ where: { status: "demo" } });
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    const sum = await summarizeAccounts(accounts);
    const daiki = sum.get("staff-3")!;
    expect(daiki.latest?.followers).toBeGreaterThan(2400);
    expect(daiki.followersChange30).toBeGreaterThan(0);
    expect(daiki.sum30.reach).toBeGreaterThan(0);
  });
});
