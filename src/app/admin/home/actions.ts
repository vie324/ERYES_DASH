"use server";

// ホームの設定（ENi）のサーバーアクション。すべて管理者だけ（画面に出さないだけでなく、ここでも確かめる）。
//  ・ショートカット：ロールごとの並び（app_settings の home_shortcuts。変えたロールだけを保存し、残りは初期値）
//  ・見える化：項目ごとの見せ方（app_settings の home_visibility）
//  ・しもんさんの言葉：登録・編集・並べ替え・停止・削除（daily_words）

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { settingsMap } from "@/lib/settings";
import {
  HOME_ROLES,
  HOME_ROLE_LABEL,
  HOME_SHORTCUTS_KEY,
  SHORTCUT_CATALOG,
  normalizeShortcutKeys,
  storedShortcutOverrides,
  type HomeRole,
} from "@/lib/home/shortcuts";
import { HOME_VISIBILITY_KEY, INSIGHT_DEFS, type InsightLevel, type InsightVisibility } from "@/lib/home/visibility";
import { sortWords } from "@/lib/home/words";

/** 言葉1つの長さの上限 */
const WORD_MAX_LENGTH = 1000;

function done(message: string, anchor: string, type: "ok" | "error" = "ok"): never {
  revalidatePath("/admin/home");
  revalidatePath("/admin");
  revalidatePath("/staff");
  redirect(`/admin/home?msg=${encodeURIComponent(message)}&t=${type}#${anchor}`);
}

function roleField(formData: FormData): HomeRole | null {
  const role = String(formData.get("role") ?? "");
  return (HOME_ROLES as string[]).includes(role) ? (role as HomeRole) : null;
}

async function saveOverrides(overrides: Partial<Record<HomeRole, string[]>>): Promise<void> {
  await getDataStore().setAppSetting(HOME_SHORTCUTS_KEY, JSON.stringify(overrides));
}

async function currentOverrides(): Promise<Partial<Record<HomeRole, string[]>>> {
  const settings = settingsMap(await getDataStore().listAppSettings());
  return storedShortcutOverrides(settings[HOME_SHORTCUTS_KEY]);
}

/** ショートカット：そのロールの並びを保存（チェックしたものを、順番の数字の小さい順に） */
export async function saveShortcutsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const role = roleField(formData);
  if (!role) done("ロールを選び直してください", "shortcuts", "error");
  const picked = SHORTCUT_CATALOG.map((def, index) => {
    const raw = String(formData.get(`order_${def.key}`) ?? "").trim();
    // 「1.5」のような小数（あいだに入れる）や「0」（先頭にする）も受け付ける。空や数字以外は最後
    const order = /^\d{1,3}(\.\d{1,3})?$/.test(raw) ? Number(raw) : Number.MAX_SAFE_INTEGER;
    return { key: def.key, index, order, on: formData.get(`on_${def.key}`) === "on" };
  })
    .filter((p) => p.on)
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((p) => p.key);
  const overrides = await currentOverrides();
  overrides[role!] = normalizeShortcutKeys(picked);
  await saveOverrides(overrides);
  done(`「${HOME_ROLE_LABEL[role!]}」のショートカットを保存しました`, `role-${role}`);
}

/** ショートカット：そのロールを初期値に戻す */
export async function resetShortcutsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const role = roleField(formData);
  if (!role) done("ロールを選び直してください", "shortcuts", "error");
  const overrides = await currentOverrides();
  delete overrides[role!];
  await saveOverrides(overrides);
  done(`「${HOME_ROLE_LABEL[role!]}」のショートカットを初期値に戻しました`, `role-${role}`);
}

function levelField(formData: FormData, name: string): InsightLevel {
  const v = String(formData.get(name) ?? "");
  return v === "names" || v === "summary" || v === "none" ? v : "none";
}

/** 見える化：項目ごとの見せ方を保存 */
export async function saveVisibilityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const value: Record<string, InsightVisibility> = {};
  for (const def of INSIGHT_DEFS) {
    value[def.key] = {
      all: levelField(formData, `all_${def.key}`),
      self: formData.get(`self_${def.key}`) === "on",
      exec: levelField(formData, `exec_${def.key}`),
    };
  }
  await getDataStore().setAppSetting(HOME_VISIBILITY_KEY, JSON.stringify(value));
  done("見える化の見せ方を保存しました", "visibility");
}

/** 見える化：初期値（酒井案）に戻す */
export async function resetVisibilityAction(): Promise<void> {
  await requireAdmin();
  await getDataStore().setAppSetting(HOME_VISIBILITY_KEY, "");
  done("見える化の見せ方を初期値（酒井案）に戻しました", "visibility");
}

function wordBody(formData: FormData): string {
  return String(formData.get("body") ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, WORD_MAX_LENGTH);
}

/** しもんさんの言葉：追加（いちばん下に入る） */
export async function createWordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const body = wordBody(formData);
  if (!body) done("言葉を入力してください", "words", "error");
  await getDataStore().createDailyWord(body);
  done("言葉を追加しました", "words");
}

/** しもんさんの言葉：文面と「出す／止める」を保存 */
export async function updateWordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const body = wordBody(formData);
  if (!id || !body) done("言葉を入力してください", "words", "error");
  await getDataStore().updateDailyWord(id, { body, isActive: formData.get("is_active") === "on" });
  done("言葉を保存しました", `word-${id}`);
}

/** しもんさんの言葉：1つ上へ／1つ下へ（並び順を 10, 20, 30… に振り直して入れ替える） */
export async function moveWordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "") === "up" ? -1 : 1;
  const db = getDataStore();
  const words = sortWords(await db.listDailyWords());
  const index = words.findIndex((w) => w.id === id);
  const target = index + dir;
  if (index === -1 || target < 0 || target >= words.length) done("これ以上動かせません", "words", "error");
  const reordered = [...words];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  for (const [i, w] of reordered.entries()) {
    const sortOrder = (i + 1) * 10;
    if (w.sortOrder !== sortOrder) await db.updateDailyWord(w.id, { sortOrder });
  }
  done("並び順を変えました", `word-${id}`);
}

/** しもんさんの言葉：削除（出した記録は残る。次に出すのは、残った言葉の続きから） */
export async function deleteWordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) done("削除する言葉が見つかりません", "words", "error");
  await getDataStore().deleteDailyWord(id);
  done("言葉を削除しました", "words");
}
