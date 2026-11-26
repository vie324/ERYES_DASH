// 依頼22：Meta から届く signed_request（つなぐのをやめた・データを消してほしい）の確かめ。

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function parseSignedRequest(signed: string): { user_id?: string; algorithm?: string } | null {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload || !env.instagramAppSecret) return null;
  const expected = createHmac("sha256", env.instagramAppSecret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number; algorithm?: string };
    if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return { ...data, user_id: data.user_id === undefined ? undefined : String(data.user_id) };
  } catch {
    return null;
  }
}
