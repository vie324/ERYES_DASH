"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { isBrand, setBrandCookie } from "@/lib/brand";

/** 業態（EREYS/ENi）を選択して保存し、それぞれのホームへ */
export async function selectBrandAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const brand = String(formData.get("brand") ?? "");
  if (!isBrand(brand)) redirect("/select");
  await setBrandCookie(brand);
  redirect(session.role === "admin" ? "/admin" : "/staff");
}
