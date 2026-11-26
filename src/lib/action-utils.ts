// サーバーアクション（フォームの保存）で使う小物。
// 入力の読み取り・戻り先のURLづくり・「DBの準備前」のときの言い換えをそろえる。

import { FeatureNotReadyError } from "@/lib/data/collections";

/** URLに ?ok= / ?error= を付ける（サーバーアクションのあとの戻り先。画面では <Flash> が出す） */
export function withMessage(path: string, kind: "ok" | "error", message: string): string {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${kind}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`;
}

export function str(fd: FormData, name: string, max = 2000): string {
  return String(fd.get(name) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

export function int(fd: FormData, name: string, fallback = 0): number {
  const raw = String(fd.get(name) ?? "").replace(/[,，円\s]/g, "");
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function num(fd: FormData, name: string, fallback = 0): number {
  const raw = String(fd.get(name) ?? "").replace(/[,，\s]/g, "");
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "1" || v === "true";
}

export function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isMonth(v: string): boolean {
  return /^\d{4}-\d{2}$/.test(v);
}

export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** 失敗したときに画面に出す文（DBの準備前なら、その旨） */
export function errorMessage(e: unknown): string {
  if (e instanceof FeatureNotReadyError) return "この機能はまだ準備中です（データベースの準備待ち）。管理者に連絡してください。";
  console.error(`[action] ${e instanceof Error ? e.message : String(e)}`);
  return "保存できませんでした。通信の状態を確かめて、もう一度お試しください。";
}

/** 入力の誤りを伝える（attempt の中で throw すると、その文がそのまま画面に出る） */
export class InputError extends Error {}

/**
 * 処理を走らせて、結果の文を返す（redirect は呼び元で、try の外で行う）。
 * 例：const r = await attempt(() => save()); redirect(withMessage(back, r.ok ? "ok" : "error", r.message));
 */
export async function attempt(fn: () => Promise<string | void>, okMessage = "保存しました"): Promise<{ ok: boolean; message: string }> {
  try {
    const msg = await fn();
    return { ok: true, message: msg || okMessage };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, message: e.message };
    return { ok: false, message: errorMessage(e) };
  }
}

/** attempt の結果から戻り先のURLを作る */
export function resultUrl(path: string, r: { ok: boolean; message: string }): string {
  return withMessage(path, r.ok ? "ok" : "error", r.message);
}
