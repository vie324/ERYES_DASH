// 追加機能（依頼10〜23）の設定：選択肢・文言・初期値など、管理者が画面から変えるもの（CLAUDE.md の 5）。
// 保存先は今の app_settings（キー＝値の文字）。値は JSON で持ち、読むときに初期値と合わせて欠けを埋める。
// 設定の画面は /admin/features（機能ごとに並ぶ）。

import type { DataStore } from "@/lib/data/types";

/** 設定を読む（未設定・壊れた値は初期値。足りない項目も初期値で埋める） */
export async function readJsonSetting<T extends object>(db: DataStore, key: string, defaults: T): Promise<T> {
  const rows = await db.listAppSettings();
  return parseJsonSetting(rows.find((r) => r.key === key)?.value ?? "", defaults);
}

export function parseJsonSetting<T extends object>(raw: string, defaults: T): T {
  if (!raw.trim()) return structuredClone(defaults);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return structuredClone(defaults);
    const out = structuredClone(defaults) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!(k in out)) continue;
      const base = out[k];
      // 型が違う値（数のはずが文字など）は初期値のまま
      if (Array.isArray(base) ? Array.isArray(v) : typeof base === typeof v || base === null) out[k] = v;
    }
    return out as T;
  } catch {
    return structuredClone(defaults);
  }
}

export async function writeJsonSetting(db: DataStore, key: string, value: object): Promise<void> {
  await db.setAppSetting(key, JSON.stringify(value));
}

/** 改行区切りの入力を、空行を落とした一覧にする（選択肢の編集欄で使う） */
export function linesOf(raw: string, opts: { max?: number; maxLength?: number } = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const v = line.trim().slice(0, opts.maxLength ?? 60);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= (opts.max ?? 50)) break;
  }
  return out;
}

/** 数の入力を範囲に丸める（読めなければ初期値） */
export function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
