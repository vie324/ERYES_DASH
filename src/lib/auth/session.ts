// セッション管理：HMAC署名付きトークンを httpOnly Cookie に保存する自前実装。
// Supabase Auth は使わず、スタッフマスタの ID＋パスワードで認証するシンプル構成。

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import type { Role } from "@/lib/data/types";

export const SESSION_COOKIE = "eryes_session";
const SESSION_DAYS = 30;

export interface Session {
  staffId: string;
  name: string;
  role: Role;
  exp: number; // epoch秒
}

function secret(): string {
  if (env.authSecret) return env.authSecret;
  // TODO: 本番では必ず AUTH_SECRET を設定する（未設定時は開発用の固定鍵で動作）
  return "eryes-dev-secret-change-me";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function createSessionToken(s: Omit<Session, "exp">): string {
  const session: Session = { ...s, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  const payload = b64url(Buffer.from(JSON.stringify(session), "utf8"));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

/** ログイン中のセッションを返す（未ログインなら null） */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** スタッフとしてのログインを必須にする（未ログインなら /login へ） */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** 管理者権限を必須にする（権限不足ならスタッフ画面へ） */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/staff");
  return session;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
