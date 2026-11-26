"use server";

// 依頼13：レジ締め・現金の出し入れ・確認・修正（入力は店長・副店長。閲覧は管理者）。
// 権限は画面だけでなく、ここでも必ず確かめる。今のレジ締め（cash_reports）にも同じ内容を書き続ける。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { InputError, attempt, int, isDate, resultUrl, str } from "@/lib/action-utils";
import { FeatureNotReadyError } from "@/lib/data/collections";
import { recordSubmission } from "@/lib/required-inputs/submissions";
import { todayJst } from "@/lib/date";
import { fetchCashSales } from "@/lib/salonone";
import {
  DENOMINATIONS,
  canConfirmCash,
  canUseCash,
  countedTotalOf,
  expectedTotalOf,
  getCashSettings,
  isLocked,
  movementNet,
} from "@/lib/cash";

function backOf(storeId: string, date: string, tab = "closing"): string {
  return `/staff/cash?store=${storeId}&date=${date}&tab=${tab}`;
}

async function guard(v: Viewer, storeId: string): Promise<void> {
  const db = getDataStore();
  const [settings, stores] = await Promise.all([getCashSettings(db), db.listStores()]);
  if (!stores.some((s) => s.id === storeId)) throw new InputError("店舗を選んでください");
  if (!(await canUseCash(v, storeId, settings, stores))) throw new InputError("この店舗のレジ締めは、店長・副店長と管理者が入力します");
}

/** レジ締めの保存（確認済みの日は、管理者が理由を書いたときだけ直せる） */
export async function saveClosingAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    if (!isDate(date) || date > todayJst()) throw new InputError("今日までの日付を選んでください");
    await guard(v, storeId);
    const db = getDataStore();
    const f = fx();
    const denominations: Record<string, number> = {};
    for (const d of DENOMINATIONS) denominations[String(d)] = Math.max(0, int(fd, `d_${d}`, 0));
    const changeFund = Math.max(0, int(fd, "change_fund", 0));
    const cashSales = Math.max(0, int(fd, "cash_sales", 0));
    const countedTotal = countedTotalOf(denominations);
    const movements = await f.cashMovements.list({ where: { storeId, date, deleted: false } }).catch(() => []);
    const expectedTotal = expectedTotalOf(changeFund, cashSales, movementNet(movements));
    const diff = countedTotal - expectedTotal;
    const diffReason = str(fd, "diff_reason", 300);
    if (diff !== 0 && !diffReason) throw new InputError(`帳簿と ${Math.abs(diff).toLocaleString()}円 合いません。差額の理由を入れてください`);
    const memo = str(fd, "memo", 500);

    const existing = await f.registerClosings.find({ storeId, date }).catch((e) => {
      if (e instanceof FeatureNotReadyError) return null;
      throw e;
    });
    const editReason = str(fd, "edit_reason", 300);
    if (isLocked(existing)) {
      if (!v.isAdmin) throw new InputError("確認済みの日は直せません。直すときは管理者に頼んでください");
      if (!editReason) throw new InputError("確認済みの日を直すときは、修正の理由を入れてください");
    }

    // これまでのレジ締め（cash_reports）にも書く（管理者の「成績・日報」の月の一覧など、これまでの画面のため）
    await db.upsertCashReport({
      storeId,
      reportDate: date,
      cashSales,
      registerBalance: countedTotal,
      movedToSafe: Math.max(0, int(fd, "moved_to_safe", 0)),
      changeFund: Math.max(0, int(fd, "next_change_fund", changeFund)),
      safeBalance: Math.max(0, int(fd, "safe_balance", 0)),
      bankDeposit: Math.max(0, int(fd, "bank_deposit", 0)),
      memo,
      createdBy: v.staffId,
    });

    const row = {
      storeId,
      date,
      changeFund,
      cashSales,
      denominations,
      countedTotal,
      expectedTotal,
      diff,
      diffReason: diff === 0 ? "" : diffReason,
      salesSource: (str(fd, "sales_source", 10) === "salonone" ? "salonone" : "manual") as "manual" | "salonone",
      memo,
      updatedAt: new Date(),
    };
    try {
      if (existing) {
        await f.registerClosings.update(existing.id, row);
        if (isLocked(existing)) {
          await f.cashEditLogs.insert({
            storeId,
            date,
            targetType: "closing",
            targetId: existing.id,
            reason: editReason,
            before: { ...existing, denominations: existing.denominations },
            after: row,
            editedBy: v.staffId,
          });
        }
      } else {
        await f.registerClosings.insert({ ...row, closedBy: v.staffId, closedAt: new Date() });
      }
    } catch (e) {
      if (e instanceof FeatureNotReadyError) return "保存しました（金種・差額・確認はデータベースの準備後に使えます）";
      throw e;
    }
    await recordSubmission(v.staffId, "cash_closing", date);
    return diff === 0 ? "保存しました。帳簿とぴったり合っています" : `保存しました（差額 ${diff > 0 ? "+" : ""}${diff.toLocaleString()}円）`;
  });
  revalidatePath("/staff/cash");
  revalidatePath("/admin/reports");
  redirect(resultUrl(backOf(storeId, date), r));
}

/** 確認（幹部・店舗の管理者・管理者）。確認した日は変えられなくなる */
export async function confirmClosingAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    if (!canConfirmCash(v, storeId)) throw new InputError("確認できるのは、その店舗の店長・副店長と管理者です");
    const f = fx();
    const c = await f.registerClosings.find({ storeId, date });
    if (!c) throw new InputError("先にレジ締めを保存してください");
    if (c.confirmedAt) throw new InputError("もう確認済みです");
    await f.registerClosings.update(c.id, { confirmedBy: v.staffId, confirmedAt: new Date() });
    return "確認しました。この日は変えられなくなりました";
  });
  revalidatePath("/staff/cash");
  redirect(resultUrl(backOf(storeId, date), r));
}

/** 現金の出し入れを足す（領収書の写真つき） */
export async function addMovementAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const date = str(fd, "date", 10);
  const r = await attempt(async () => {
    if (!isDate(date) || date > todayJst()) throw new InputError("今日までの日付を選んでください");
    await guard(v, storeId);
    const settings = await getCashSettings(getDataStore());
    const kind = settings.kinds.find((k) => k.key === str(fd, "kind", 40));
    if (!kind) throw new InputError("種類を選んでください");
    const amount = int(fd, "amount", 0);
    if (amount <= 0) throw new InputError("金額を入れてください");
    const photo = str(fd, "receipt", 1_500_000);
    const f = fx();
    const closing = await f.registerClosings.find({ storeId, date });
    if (isLocked(closing) && !v.isAdmin) throw new InputError("確認済みの日には足せません。管理者に頼んでください");
    const editReason = str(fd, "edit_reason", 300);
    if (isLocked(closing) && !editReason) throw new InputError("確認済みの日に足すときは、修正の理由を入れてください");
    const mv = await f.cashMovements.insert({
      storeId,
      date,
      kind: kind.key,
      direction: kind.direction,
      description: str(fd, "description", 200),
      amount,
      receiptPhoto: photo.startsWith("data:image/") ? photo : "",
      createdBy: v.staffId,
    });
    if (isLocked(closing)) {
      await f.cashEditLogs.insert({ storeId, date, targetType: "movement", targetId: mv.id, reason: editReason, before: {}, after: { ...mv, receiptPhoto: mv.receiptPhoto ? "（写真あり）" : "" }, editedBy: v.staffId });
    }
    return `${kind.label} ${amount.toLocaleString()}円 を記録しました`;
  });
  revalidatePath("/staff/cash");
  redirect(resultUrl(backOf(storeId, date, "movements"), r));
}

export async function deleteMovementAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  let back = "/staff/cash?tab=movements";
  const r = await attempt(async () => {
    const f = fx();
    const mv = await f.cashMovements.get(id);
    if (!mv || mv.deleted) throw new InputError("記録が見つかりません");
    back = backOf(mv.storeId, mv.date, "movements");
    await guard(v, mv.storeId);
    const closing = await f.registerClosings.find({ storeId: mv.storeId, date: mv.date });
    const editReason = str(fd, "edit_reason", 300);
    if (isLocked(closing)) {
      if (!v.isAdmin) throw new InputError("確認済みの日の記録は消せません");
      if (!editReason) throw new InputError("確認済みの日の記録を消すときは、修正の理由を入れてください");
    }
    await f.cashMovements.update(id, { deleted: true, updatedAt: new Date() });
    if (isLocked(closing)) {
      await f.cashEditLogs.insert({ storeId: mv.storeId, date: mv.date, targetType: "movement", targetId: id, reason: editReason, before: { ...mv, receiptPhoto: "" }, after: { deleted: true }, editedBy: v.staffId });
    }
  }, "消しました");
  revalidatePath("/staff/cash");
  redirect(resultUrl(back, r));
}

/** SalonOne から現金売上を取り込む（API仕様が届くまでは「取れません」） */
export async function fetchSalonOneCashAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const storeId = str(fd, "store", 80);
  const date = str(fd, "date", 10);
  let amount: number | null = null;
  const r = await attempt(async () => {
    await guard(v, storeId);
    amount = await fetchCashSales(storeId, date);
    if (amount === null) throw new InputError("SalonOneから取り込めませんでした（APIの設定がまだか、データがありません）。手で入れてください");
    return `SalonOneの現金売上（${amount.toLocaleString()}円）を入れました。確かめて保存してください`;
  });
  redirect(resultUrl(`${backOf(storeId, date)}${amount !== null ? `&salonone=${amount}` : ""}`, r));
}
