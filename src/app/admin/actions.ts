"use server";

// 管理者画面のサーバーアクション集

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import { formatDateTimeJa, jstLocalToUtc } from "@/lib/date";
import { multicastText, pushText } from "@/lib/line/client";
import { normalizeTiers } from "@/lib/eni/forms";
import { syncAllRoomMembers } from "@/lib/chat";
import {
  LINE_NOTICE_SETTINGS_KEY,
  NOTICE_HOURS,
  SCHEDULED_KINDS,
  linkCandidates,
  normalizeKeywords,
  normalizePhone,
  parseLineNoticeSettings,
  sendCompletionNotice,
  type LineNoticeSettings,
} from "@/lib/line/appointment-notices";
import {
  APP_SETTING_DEFS,
  CHOICE_SETTING_DEFS,
  TEXT_SETTING_DEFS,
  normalizeSettingValue,
  normalizeTextSetting,
} from "@/lib/settings";
import type { AssistantRank, JobType, Role } from "@/lib/data/types";

function jobTypeField(formData: FormData): JobType {
  const v = String(formData.get("job_type") ?? "");
  return v === "stylist" || v === "assistant" ? v : "";
}

/** 所属店舗（存在する店舗のIDだけ受け付ける。未指定・不明なら fallback） */
async function storeField(formData: FormData, fallback: string): Promise<string> {
  const id = String(formData.get("store_id") ?? "");
  if (!id) return fallback;
  const stores = await getDataStore().listStores();
  return stores.some((s) => s.id === id) ? id : fallback;
}

/** 権限（ロール）。選択肢にない値はスタッフにする */
function roleField(formData: FormData): Role {
  const v = String(formData.get("role") ?? "staff");
  return v === "admin" || v === "manager" ? v : "staff";
}

/** 担当店舗（存在する店舗のIDだけ。店舗の管理者が見る店舗） */
async function managedStoresField(formData: FormData): Promise<string[]> {
  const picked = formData.getAll("managed_store_ids").map(String);
  if (picked.length === 0) return [];
  const known = new Set((await getDataStore().listStores()).map((s) => s.id));
  return [...new Set(picked.filter((id) => known.has(id)))];
}

function rankField(formData: FormData): AssistantRank {
  const v = String(formData.get("rank") ?? "");
  return v === "first" || v === "middle" || v === "final" ? v : "";
}

// ---- 顧客 ----

export async function updateCustomerNameAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!id || !fullName) redirect(`/admin/customers/${id}?error=name`);
  // 電話番号（任意）。入っているのに電話番号として読めなければ保存しない
  const rawPhone = formData.has("phone") ? String(formData.get("phone") ?? "").trim() : null;
  const phone = rawPhone === null ? undefined : rawPhone === "" ? "" : normalizePhone(rawPhone);
  if (rawPhone && !phone) redirect(`/admin/customers/${id}?error=phone`);
  await getDataStore().updateCustomer(id, { fullName, ...(phone !== undefined ? { phone } : {}) });
  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}?saved=1`);
}

/** LINE未登録のお客様を店舗で追加する（ホットペッパーなどで入った予約を登録するため。名前＋電話番号） */
export async function createUnlinkedCustomerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 60);
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (!fullName || (rawPhone && !phone)) redirect("/admin/appointments?error=customer_input");
  const created = await getDataStore().createCustomer({ lineUserId: null, fullName, phone });
  revalidatePath("/admin/appointments");
  revalidatePath("/admin/customers");
  redirect(`/admin/appointments?customer_added=${created.id}#new-appointment`);
}

/**
 * LINEとつなぐ：店舗が入れた「LINE未連携」のお客様を、同じ電話番号のLINEのお客様にまとめる
 * （予約・カウンセリングを付け替えて、未連携の記録を消す）。電話番号が同じ組だけを受け付ける。
 */
export async function linkCustomerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const keepId = String(formData.get("keep_id") ?? "");
  const removeId = String(formData.get("remove_id") ?? "");
  const db = getDataStore();
  const pair = linkCandidates(await db.listCustomers()).find(
    (c) => c.lineCustomer.id === keepId && c.unlinked.id === removeId
  );
  if (!pair) redirect("/admin/customers?error=link");
  await db.mergeCustomers(keepId, removeId);
  revalidatePath("/admin/customers");
  revalidatePath("/admin/appointments");
  redirect(`/admin/customers?linked=1`);
}

// ---- 次回予約 ----

export async function createAppointmentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customer_id") ?? "");
  const scheduledLocal = String(formData.get("scheduled_at") ?? ""); // "YYYY-MM-DDTHH:mm"（JST）
  const staffId = String(formData.get("staff_id") ?? "") || null;
  const backTo = String(formData.get("back_to") ?? "/admin/appointments");

  if (!customerId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledLocal)) {
    redirect(`${backTo}?error=input`);
  }

  const db = getDataStore();
  const customer = await db.getCustomer(customerId);
  if (!customer) redirect(`${backTo}?error=customer`);

  const appointment = await db.createNextAppointment({
    customerId,
    scheduledAt: jstLocalToUtc(scheduledLocal),
    staffId,
  });
  // 予約完了のお知らせ（LINE）。送れなくても予約の登録は止めない（送れなかった分は定時実行でもう一度）
  try {
    const settings = parseLineNoticeSettings(
      (await db.listAppSettings()).find((r) => r.key === LINE_NOTICE_SETTINGS_KEY)?.value
    );
    await sendCompletionNotice(db, appointment, settings);
  } catch (e) {
    console.error("[line] 予約完了のお知らせに失敗:", e instanceof Error ? e.message : e);
  }
  revalidatePath("/admin/appointments");
  redirect(`${backTo}?saved=1`);
}

/** LINEのお知らせの設定（文面・送る時刻・合言葉）を保存 */
export async function saveLineNoticeSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const current = parseLineNoticeSettings(
    (await getDataStore().listAppSettings()).find((r) => r.key === LINE_NOTICE_SETTINGS_KEY)?.value
  );
  const str = (name: string, fallback: string) => {
    const v = String(formData.get(name) ?? "").replace(/\r\n?/g, "\n").trim();
    return v ? v.slice(0, 1000) : fallback;
  };
  const hour = (name: string, fallback: number) => {
    const n = Number(formData.get(name));
    return NOTICE_HOURS.includes(n) ? n : fallback;
  };
  const next: LineNoticeSettings = {
    ...current,
    completion: {
      enabled: formData.get("completion_enabled") === "on",
      template: str("completion_template", current.completion.template),
    },
    keywords: normalizeKeywords(String(formData.get("keywords") ?? "").split(/[\n,、]/)),
    replyFound: str("reply_found", current.replyFound),
    replyNone: str("reply_none", current.replyNone),
    askPhone: str("ask_phone", current.askPhone),
    phoneSaved: str("phone_saved", current.phoneSaved),
  };
  for (const kind of SCHEDULED_KINDS) {
    next[kind] = {
      enabled: formData.get(`${kind}_enabled`) === "on",
      hour: hour(`${kind}_hour`, current[kind].hour),
      template: str(`${kind}_template`, current[kind].template),
    };
  }
  if (next.keywords.length === 0) next.keywords = current.keywords;
  await getDataStore().setAppSetting(LINE_NOTICE_SETTINGS_KEY, JSON.stringify(next));
  revalidatePath("/admin/appointments/settings");
  redirect("/admin/appointments/settings?saved=1");
}

/** LINEのお知らせの設定を初期値に戻す（お客様へのLINEのオン・オフは、今のまま残す） */
export async function resetLineNoticeSettingsAction(): Promise<void> {
  await requireAdmin();
  const db = getDataStore();
  const current = parseLineNoticeSettings(
    (await db.listAppSettings()).find((r) => r.key === LINE_NOTICE_SETTINGS_KEY)?.value
  );
  await db.setAppSetting(LINE_NOTICE_SETTINGS_KEY, JSON.stringify({ enabled: current.enabled }));
  revalidatePath("/admin/appointments/settings");
  redirect("/admin/appointments/settings?reset=1");
}

/**
 * お客様へのLINE（予約のお知らせ・「予約確認」への返事・電話番号のお願い）をまとめてオン・オフする。
 * 文面の保存とは別のボタンにして、うっかり切り替わらないようにしている。
 */
export async function setCustomerLineAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const on = String(formData.get("enabled") ?? "") === "on";
  const db = getDataStore();
  const current = parseLineNoticeSettings(
    (await db.listAppSettings()).find((r) => r.key === LINE_NOTICE_SETTINGS_KEY)?.value
  );
  await db.setAppSetting(LINE_NOTICE_SETTINGS_KEY, JSON.stringify({ ...current, enabled: on }));
  revalidatePath("/admin/appointments/settings");
  revalidatePath("/admin/appointments");
  revalidatePath("/admin");
  redirect(`/admin/appointments/settings?switched=${on ? "on" : "off"}`);
}

export async function deleteAppointmentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const backTo = String(formData.get("back_to") ?? "/admin/appointments");
  if (id) await getDataStore().deleteNextAppointment(id);
  revalidatePath("/admin/appointments");
  redirect(`${backTo}?deleted=1`);
}

/** お客様からの変更希望を確定する（日時を差し替え、リマインドを再送対象に戻し、LINEでお知らせ） */
export async function approveAppointmentChangeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  // 確定日時：既定はお客様の希望日時。管理者が調整した場合はその値
  const scheduledLocal = String(formData.get("scheduled_at") ?? "");
  if (!id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledLocal)) {
    redirect("/admin/appointments?error=input");
  }

  const db = getDataStore();
  const appointment = await db.getNextAppointment(id);
  if (!appointment) redirect("/admin/appointments?error=input");

  const newAt = jstLocalToUtc(scheduledLocal);
  await db.updateNextAppointment(id, {
    scheduledAt: newAt,
    status: "scheduled",
    requestedNewAt: null,
    changeNote: "",
    // 日時が変わったので、1週間前案内・前日リマインドを新しい日程で送り直す
    reminderSentAt: null,
    preReminderSentAt: null,
  });

  // お客様へ変更確定のお知らせ（LINE未連携なら送信されない）
  const customer = await db.getCustomer(appointment!.customerId);
  if (customer?.lineUserId) {
    const store = await db.getStore();
    await pushText(
      customer.lineUserId,
      `【${store.name}】ご予約変更のお知らせ\n` +
        `${customer.fullName} 様\n\n` +
        `ご予約を ${formatDateTimeJa(newAt, true)} に変更いたしました。\n` +
        `ご来店をお待ちしております。`
    );
  }

  revalidatePath("/admin/appointments");
  redirect("/admin/appointments?changed=1");
}

// ---- カウンセリング（管理者からの確認操作） ----

export async function adminConfirmCounselingAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("IDが指定されていません");
  await getDataStore().confirmCounselingResponse(id, session.staffId);
  revalidatePath("/admin/counseling");
  revalidatePath("/staff/counseling");
  redirect(`/admin/counseling?confirmed=1`);
}

// ---- 一斉配信 ----

export async function sendBroadcastAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const body = String(formData.get("body") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";

  if (!body) redirect("/admin/broadcast?error=empty");
  if (body.length > 1000) redirect("/admin/broadcast?error=toolong");
  if (!confirmed) redirect("/admin/broadcast?error=confirm");

  const db = getDataStore();
  const customers = await db.listCustomers();
  const lineUserIds = customers
    .map((c) => c.lineUserId)
    .filter((id): id is string => Boolean(id));

  const sentCount = await multicastText(lineUserIds, body);
  await db.createBroadcast({ sentBy: session.staffId, body, recipientCount: sentCount });

  revalidatePath("/admin/broadcast");
  redirect(`/admin/broadcast?sent=${sentCount}`);
}

// ---- マスタ設定：店舗 ----

export async function updateStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const gpsRadiusM = Number(formData.get("gps_radius_m"));
  const attendanceEnabled = formData.get("attendance_enabled") === "on";

  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(gpsRadiusM) || gpsRadiusM <= 0) {
    redirect("/admin/settings?error=store");
  }

  await getDataStore().updateStoreById(id, {
    name,
    address,
    lat,
    lng,
    gpsRadiusM: Math.round(gpsRadiusM),
    attendanceEnabled,
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=store");
}

export async function createStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) redirect("/admin/settings?error=store");
  await getDataStore().createStore({ name, address });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=store");
}

export async function deleteStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (formData.get("confirm") !== "on") {
    redirect(`/admin/settings?msg=${encodeURIComponent("削除するには確認チェックを入れてください")}&t=error`);
  }
  let errorMsg = "";
  try {
    await getDataStore().deleteStore(id);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "削除に失敗しました";
  }
  revalidatePath("/admin/settings");
  if (errorMsg) redirect(`/admin/settings?msg=${encodeURIComponent(errorMsg)}&t=error`);
  redirect(`/admin/settings?msg=${encodeURIComponent("店舗を削除しました")}&t=ok`);
}

// ---- マスタ設定：スタッフ ----

/** 段数（一人当たり同時に回す席数）。未指定・壊れた値は1段に丸める */
function tiersField(formData: FormData): number {
  return normalizeTiers(formData.get("tiers"));
}

export async function createStaffAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = roleField(formData);
  const fixedOvertimeHours = Number(formData.get("fixed_overtime_hours") ?? 20);

  if (!name || !loginId || password.length < 8 || !Number.isFinite(fixedOvertimeHours)) {
    redirect("/admin/settings?error=staff_input");
  }

  const db = getDataStore();
  const store = await db.getStore();
  const storeId = await storeField(formData, store.id);
  try {
    await db.createStaff({
      storeId,
      name,
      loginId,
      passwordHash: hashPassword(password),
      role,
      jobType: jobTypeField(formData),
      rank: rankField(formData),
      isExecutive: formData.get("is_executive") === "on",
      tiers: tiersField(formData),
      fixedOvertimeHours: Math.max(0, Math.round(fixedOvertimeHours)),
      managedStoreIds: await managedStoresField(formData),
    });
  } catch {
    redirect("/admin/settings?error=staff_duplicate");
  }
  // 新しく入ったスタッフも、全体共有ルームに自動で入る（失敗してもスタッフの追加は止めない）
  await syncAllRoomMembers(db).catch((e) => console.error("[chat] 全体共有への参加に失敗:", e));
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=staff");
}

export async function updateStaffAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = roleField(formData);
  const fixedOvertimeHours = Number(formData.get("fixed_overtime_hours") ?? 20);
  const newPassword = String(formData.get("new_password") ?? "");
  const isActive = formData.get("is_active") === "on";

  if (!id || !name) redirect("/admin/settings?error=staff_input");
  if (newPassword && newPassword.length < 8) redirect("/admin/settings?error=staff_password");
  // 自分自身の管理者権限・有効フラグは外せない（締め出し防止）
  const lockSelf = id === session.staffId;

  const current = await getDataStore().getStaff(id);
  await getDataStore().updateStaff(id, {
    name,
    // 呼び名（シフトのカレンダーなどに出す名前）。欄が無いフォームから来たときは変えない
    ...(formData.has("nickname") ? { nickname: String(formData.get("nickname") ?? "").trim().slice(0, 12) } : {}),
    storeId: await storeField(formData, current?.storeId ?? ""),
    role: lockSelf ? "admin" : role,
    jobType: jobTypeField(formData),
    rank: rankField(formData),
    isExecutive: formData.get("is_executive") === "on",
    mission: String(formData.get("mission") ?? "").trim().slice(0, 500),
    tiers: tiersField(formData),
    fixedOvertimeHours: Math.max(0, Math.round(fixedOvertimeHours)),
    managedStoreIds: await managedStoresField(formData),
    isActive: lockSelf ? true : isActive,
    ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
  });
  // 有効に戻した人も全体共有ルームに入れる（すでに入っている人には何もしない）
  if (isActive) {
    await syncAllRoomMembers(getDataStore()).catch((e) => console.error("[chat] 全体共有への参加に失敗:", e));
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=staff");
}

export async function deleteStaffAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id === session.staffId) {
    redirect(`/admin/settings?msg=${encodeURIComponent("自分自身は削除できません")}&t=error`);
  }
  if (formData.get("confirm") !== "on") {
    redirect(`/admin/settings?msg=${encodeURIComponent("削除するには確認チェックを入れてください")}&t=error`);
  }
  // 強制削除：記録があっても消す。取り消せないので、ログインIDの入力も求める
  const force = formData.get("force") === "on";
  const db = getDataStore();
  if (force) {
    const typed = String(formData.get("confirm_login_id") ?? "").trim();
    const target = await db.getStaff(id);
    if (!target) {
      redirect(`/admin/settings?msg=${encodeURIComponent("スタッフが見つかりません")}&t=error`);
    }
    if (typed !== target.loginId) {
      redirect(
        `/admin/settings?msg=${encodeURIComponent("強制削除するには、そのスタッフのログインIDを正しく入力してください")}&t=error`
      );
    }
  }

  let errorMsg = "";
  try {
    await db.deleteStaff(id, force ? { force: true, reassignTo: session.staffId } : undefined);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "削除に失敗しました";
  }
  revalidatePath("/admin/settings");
  if (errorMsg) redirect(`/admin/settings?msg=${encodeURIComponent(errorMsg)}&t=error`);
  redirect(
    `/admin/settings?msg=${encodeURIComponent(
      force
        ? "スタッフを強制削除しました（トークルーム・議事録などの共有物はあなたに引き継ぎました）"
        : "スタッフを削除しました"
    )}&t=ok`
  );
}


/** アプリ設定（サロンボードのURLなど）の保存 */
export async function saveAppSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDataStore();
  for (const def of APP_SETTING_DEFS) {
    const value = normalizeSettingValue(def.key, String(formData.get(def.key) ?? ""));
    if (value === null) {
      redirect(`/admin/settings?msg=${encodeURIComponent(`「${def.label}」の形式を確認してください（https:// で始まるURL）`)}&t=error`);
    }
    await db.setAppSetting(def.key, value);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(`/admin/settings?msg=${encodeURIComponent("設定を保存しました")}&t=ok`);
}

/**
 * 文章の設定（幹部メニューの「大切にすること」など、複数行の文面）の保存。
 * 空にして保存すると、初期の文面に戻る（lib/settings.ts の TEXT_SETTING_DEFS）。
 */
export async function saveTextSettingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const def = TEXT_SETTING_DEFS.find((d) => d.key === key);
  if (!def) {
    redirect(`/admin/settings?msg=${encodeURIComponent("保存できない項目です")}&t=error`);
  }
  await getDataStore().setAppSetting(key, normalizeTextSetting(key, String(formData.get("value") ?? "")));
  revalidatePath("/admin/settings");
  revalidatePath("/staff/exec");
  redirect(`/admin/settings?msg=${encodeURIComponent(`「${def!.label}」を保存しました`)}&t=ok#${key}`);
}

/** 選ぶ設定（全体共有に投稿できる人・毎朝のリマインドの時刻など）の保存。選択肢にない値は受け付けない */
export async function saveChoiceSettingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");
  const def = CHOICE_SETTING_DEFS.find((d) => d.key === key);
  if (!def || !def.options.some((o) => o.value === value)) {
    redirect(`/admin/settings?msg=${encodeURIComponent("選択肢から選んでください")}&t=error`);
  }
  await getDataStore().setAppSetting(key, value);
  revalidatePath("/admin/settings");
  revalidatePath("/staff/chat", "layout");
  redirect(`/admin/settings?msg=${encodeURIComponent(`「${def!.label}」を保存しました`)}&t=ok#${key}`);
}
