"use server";

// 依頼11（68）：ENi Wikipedia の保存・取り込み・AI検索。
// 編集は幹部・管理者（と権限「ENi Wikipediaを編集できる」の人）だけ。ここでも必ず確かめる。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import type { WikiVisibility } from "@/lib/data/tables";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { InputError, attempt, resultUrl, str, errorMessage } from "@/lib/action-utils";
import { canEditWiki, getWikiSettings, restorePageRevision, savePage } from "@/lib/wiki";
import { askWiki, type WikiAnswer } from "@/lib/wiki/ask";

function wikiViewerOf(v: Viewer) {
  return { isAdmin: v.isAdmin, isExec: v.isExec || v.isStoreManager };
}

async function requireEditor(): Promise<Viewer> {
  const v = await requireViewer();
  if (!(await canEditWiki(v.me, wikiViewerOf(v)))) redirect("/staff/wiki");
  return v;
}

function visibilityOf(raw: string): WikiVisibility {
  return raw === "exec" || raw === "admin" ? raw : "all";
}

export async function savePageAction(fd: FormData): Promise<void> {
  const v = await requireEditor();
  const id = str(fd, "id", 80);
  let savedId = id;
  const r = await attempt(async () => {
    const title = str(fd, "title", 120);
    const body = str(fd, "body", 60000);
    const settings = await getWikiSettings(getDataStore());
    const category = str(fd, "category", 30);
    if (!title) throw new InputError("題名を入れてください");
    if (!settings.categories.includes(category)) throw new InputError("カテゴリを選んでください");
    // 管理者だけのページは管理者しか作れない（幹部が自分の見られないページを作らないように）
    const visibility = visibilityOf(str(fd, "visibility", 10));
    if (visibility === "admin" && !v.isAdmin) throw new InputError("「管理者だけ」は管理者だけが選べます");
    if (id) {
      const old = await fx().wikiPages.get(id);
      if (!old || old.deleted) throw new InputError("ページが見つかりません");
      if (old.visibility === "admin" && !v.isAdmin) throw new InputError("このページは管理者だけが直せます");
    }
    const page = await savePage({ id: id || undefined, title, category, body, visibility, editedBy: v.staffId, note: str(fd, "note", 100) || undefined });
    savedId = page.id;
  });
  revalidatePath("/staff/wiki");
  redirect(resultUrl(r.ok ? `/staff/wiki/${savedId}` : `/staff/wiki/edit${id ? `?id=${id}` : ""}`, r));
}

export async function deletePageAction(fd: FormData): Promise<void> {
  const v = await requireEditor();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const page = await fx().wikiPages.get(id);
    if (!page) throw new InputError("ページが見つかりません");
    if (page.visibility === "admin" && !v.isAdmin) throw new InputError("このページは管理者だけが消せます");
    await fx().wikiPages.update(id, { deleted: true, updatedBy: v.staffId, updatedAt: new Date() });
    await fx().wikiRevisions.insert({ pageId: id, title: page.title, category: page.category, body: page.body, visibility: page.visibility, note: "削除", editedBy: v.staffId });
  }, "ページを消しました（管理者は履歴から戻せます）");
  revalidatePath("/staff/wiki");
  redirect(resultUrl("/staff/wiki", r));
}

export async function restorePageAction(fd: FormData): Promise<void> {
  const v = await requireEditor();
  const revId = str(fd, "revision", 80);
  let pageId = "";
  const r = await attempt(async () => {
    const rev = await fx().wikiRevisions.get(revId);
    if (!rev) throw new InputError("履歴が見つかりません");
    if (rev.visibility === "admin" && !v.isAdmin) throw new InputError("このページは管理者だけが直せます");
    await fx().wikiPages.update(rev.pageId, { deleted: false });
    const page = await restorePageRevision(revId, v.staffId);
    if (!page) throw new InputError("戻せませんでした");
    pageId = page.id;
  }, "この版に戻しました");
  revalidatePath("/staff/wiki");
  redirect(resultUrl(pageId ? `/staff/wiki/${pageId}` : "/staff/wiki", r));
}

// ---------------------------------------------------------------- Notionの取り込み（画面から1ページずつ送る）

/** 画像を1枚保存して、本文で使うURLを返す（端末で縮めた data URL） */
export async function uploadWikiImageAction(input: { fileName: string; dataUrl: string }): Promise<{ ok: boolean; url?: string; message?: string }> {
  const v = await requireEditor();
  if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(input.dataUrl) || input.dataUrl.length > 3_000_000) {
    return { ok: false, message: "画像が大きすぎるか、形式が違います" };
  }
  try {
    const img = await fx().wikiImages.insert({ pageId: null, fileName: input.fileName.slice(0, 200), dataUrl: input.dataUrl, createdBy: v.staffId });
    return { ok: true, url: `/api/wiki/image/${img.id}` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/**
 * 取り込んだ1ページを保存する。同じ元ファイル（sourcePath）のページがあれば上書きし、無ければ作る。
 * 本文の画像（/api/wiki/image/…）は、このページの画像として結びつける（見る範囲の判定に使う）。
 */
export async function importWikiPageAction(input: {
  title: string;
  category: string;
  visibility: string;
  body: string;
  sourcePath: string;
}): Promise<{ ok: boolean; id?: string; updated?: boolean; message?: string }> {
  const v = await requireEditor();
  try {
    const settings = await getWikiSettings(getDataStore());
    const category = settings.categories.includes(input.category) ? input.category : settings.categories[0];
    const visibility = visibilityOf(input.visibility);
    if (visibility === "admin" && !v.isAdmin) return { ok: false, message: "「管理者だけ」は管理者だけが選べます" };
    const title = input.title.trim().slice(0, 120) || "（題名なし）";
    const existing = input.sourcePath ? await fx().wikiPages.find({ sourcePath: input.sourcePath.slice(0, 500), deleted: false }) : null;
    const page = await savePage({
      id: existing?.id,
      title,
      category,
      body: input.body.slice(0, 60000),
      visibility,
      sourcePath: input.sourcePath.slice(0, 500),
      editedBy: v.staffId,
      note: existing ? "Notionから取り込み（上書き）" : "Notionから取り込み",
    });
    const ids = [...input.body.matchAll(/\/api\/wiki\/image\/([A-Za-z0-9-]+)/g)].map((m) => m[1]);
    for (const id of new Set(ids)) await fx().wikiImages.update(id, { pageId: page.id });
    revalidatePath("/staff/wiki");
    return { ok: true, id: page.id, updated: Boolean(existing) };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

// ---------------------------------------------------------------- AI検索

export async function askWikiAction(question: string): Promise<WikiAnswer> {
  const v = await requireViewer();
  try {
    return await askWiki(getDataStore(), { question: String(question ?? ""), staffId: v.staffId, viewer: wikiViewerOf(v) });
  } catch (e) {
    console.error(`[wiki] AI検索でエラー: ${e instanceof Error ? e.message : String(e)}`);
    return { found: false, answer: "", sources: [], hits: [], ai: false, note: "検索できませんでした。もう一度お試しください。" };
  }
}
