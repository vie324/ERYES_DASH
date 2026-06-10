"use server";

// 管理者画面のサーバーアクション集

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import { jstLocalToUtc } from "@/lib/date";
import { multicastText } from "@/lib/line/client";
import type { Role } from "@/lib/data/types";

// ---- 顧客 ----

export async function updateCustomerNameAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!id || !fullName) redirect(`/admin/customers/${id}?error=name`);
  await getDataStore().updateCustomer(id, { fullName });
  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}?saved=1`);
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

  await db.createNextAppointment({
    customerId,
    scheduledAt: jstLocalToUtc(scheduledLocal),
    staffId,
  });
  revalidatePath("/admin/appointments");
  redirect(`${backTo}?saved=1`);
}

export async function deleteAppointmentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const backTo = String(formData.get("back_to") ?? "/admin/appointments");
  if (id) await getDataStore().deleteNextAppointment(id);
  revalidatePath("/admin/appointments");
  redirect(`${backTo}?deleted=1`);
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
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const gpsRadiusM = Number(formData.get("gps_radius_m"));
  const attendanceEnabled = formData.get("attendance_enabled") === "on";

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(gpsRadiusM) || gpsRadiusM <= 0) {
    redirect("/admin/settings?error=store");
  }

  await getDataStore().updateStore({
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

// ---- マスタ設定：スタッフ ----

export async function createStaffAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = (String(formData.get("role") ?? "staff") === "admin" ? "admin" : "staff") as Role;
  const fixedOvertimeHours = Number(formData.get("fixed_overtime_hours") ?? 20);

  if (!name || !loginId || password.length < 8 || !Number.isFinite(fixedOvertimeHours)) {
    redirect("/admin/settings?error=staff_input");
  }

  const db = getDataStore();
  const store = await db.getStore();
  try {
    await db.createStaff({
      storeId: store.id,
      name,
      loginId,
      passwordHash: hashPassword(password),
      role,
      fixedOvertimeHours: Math.max(0, Math.round(fixedOvertimeHours)),
    });
  } catch {
    redirect("/admin/settings?error=staff_duplicate");
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=staff");
}

export async function updateStaffAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = (String(formData.get("role") ?? "staff") === "admin" ? "admin" : "staff") as Role;
  const fixedOvertimeHours = Number(formData.get("fixed_overtime_hours") ?? 20);
  const newPassword = String(formData.get("new_password") ?? "");
  const isActive = formData.get("is_active") === "on";

  if (!id || !name) redirect("/admin/settings?error=staff_input");
  if (newPassword && newPassword.length < 8) redirect("/admin/settings?error=staff_password");
  // 自分自身の管理者権限・有効フラグは外せない（締め出し防止）
  const lockSelf = id === session.staffId;

  await getDataStore().updateStaff(id, {
    name,
    role: lockSelf ? "admin" : role,
    fixedOvertimeHours: Math.max(0, Math.round(fixedOvertimeHours)),
    isActive: lockSelf ? true : isActive,
    ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=staff");
}
