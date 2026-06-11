// パスワードハッシュ（Node標準の scrypt を使用。外部ライブラリ不要）
// 保存形式: scrypt$N$r$p$salt(base64)$hash(base64)

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [scheme, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(plain, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
