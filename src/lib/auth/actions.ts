"use server";

// ログイン・ログアウトのサーバーアクション

import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "@/lib/auth/session";

export async function loginAction(formData: FormData): Promise<void> {
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) {
    redirect("/login?error=empty");
  }

  const staff = await getDataStore().getStaffByLoginId(loginId);
  if (!staff || !staff.isActive || !verifyPassword(password, staff.passwordHash)) {
    redirect("/login?error=invalid");
  }

  await setSessionCookie(
    createSessionToken({ staffId: staff.id, name: staff.name, role: staff.role })
  );
  redirect(staff.role === "admin" ? "/admin" : "/staff");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
