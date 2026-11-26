"use server";

// 依頼16：業務の整理の取り込み（管理者だけ）。まず確認 → 「この内容で取り込む」で登録。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { InputError, attempt, resultUrl, str } from "@/lib/action-utils";
import { applyWorkRows, parseWorkTable, type WorkRow } from "@/lib/work-import";
import { savePage } from "@/lib/wiki";
import { getRequiredInputsSettings, INPUT_DEFS, REQUIRED_INPUTS_KEY, type InputKey } from "@/lib/required-inputs";
import { writeJsonSetting } from "@/lib/feature-settings";

export async function previewWorkImportAction(fd: FormData): Promise<void> {
  const session = await requireAdmin();
  const file = fd.get("csv");
  let batchId = "";
  const r = await attempt(async () => {
    const text = file instanceof File && file.size > 0 ? await file.text() : str(fd, "text", 500_000);
    if (!text.trim()) throw new InputError("表を貼り付けるか、CSVを選んでください");
    const { rows, errors } = parseWorkTable(text);
    if (rows.length === 0) throw new InputError(errors[0] ?? "業務が1つも読めませんでした");
    const batch = await fx().workImportBatches.insert({
      fileName: file instanceof File && file.size > 0 ? file.name : "貼り付け",
      rows: rows as unknown as Record<string, unknown>[],
      createdBy: session.staffId,
    });
    batchId = batch.id;
    return `${rows.length}件の業務を読みました。当てはめを確かめて「この内容で取り込む」を押してください`;
  });
  redirect(resultUrl(batchId ? `/admin/work-import?batch=${batchId}` : "/admin/work-import", r));
}

export async function applyWorkImportAction(fd: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = str(fd, "batch", 80);
  const r = await attempt(async () => {
    const f = fx();
    const batch = await f.workImportBatches.get(id);
    if (!batch) throw new InputError("取り込みの記録が見つかりません");
    if (batch.appliedAt) throw new InputError("この表はもう取り込んでいます");
    const db = getDataStore();
    // 画面で当てはめ先を直したもの
    const rows = (batch.rows as unknown as WorkRow[]).map((row) => {
      const t = str(fd, `target_${row.line}`, 20);
      return t ? { ...row, target: t as WorkRow["target"], issues: t === "skip" || t === "wiki" || t === "feature" ? [] : row.issues } : row;
    });
    const result = await applyWorkRows(db, rows, session.staffId, {
      createWiki: async (title, body) => {
        await savePage({ title, category: "店舗運営", body, visibility: "all", editedBy: session.staffId, note: "業務の整理から作成" });
      },
      createNextRequest: async (title, detail) => {
        await f.nextRequestItems.insert({ title, detail, source: "業務の整理", createdBy: session.staffId });
      },
      addRequiredInput: async (label) => {
        const key = (Object.keys(INPUT_DEFS) as InputKey[]).find((k) => label.includes(INPUT_DEFS[k].label.replace(/（.*）/, "")));
        if (!key) return false;
        const s = await getRequiredInputsSettings(db);
        if (!s.rules.all.includes(key)) s.rules.all = [...s.rules.all, key];
        await writeJsonSetting(db, REQUIRED_INPUTS_KEY, s);
        return true;
      },
    });
    await f.workImportBatches.update(id, { appliedAt: new Date(), summary: result as unknown as Record<string, unknown> });
    return `取り込みました（登録 ${result.created.length}件・次の依頼 ${result.nextRequests.length}件・判断できない ${result.undecided.length}件）`;
  });
  revalidatePath("/staff/tasks");
  redirect(resultUrl(`/admin/work-import?batch=${id}`, r));
}
