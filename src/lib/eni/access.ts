// ENi機能の権限ヘルパー：幹部（is_executive）か管理者かを判定する

import { getDataStore } from "@/lib/data";
import type { Session } from "@/lib/auth/session";

export async function isExecutive(session: Session): Promise<boolean> {
  if (session.role === "admin") return true;
  const me = await getDataStore().getStaff(session.staffId);
  return me?.isExecutive ?? false;
}

/** 練習時間（分）の表示："90 → 1h30" "60 → 1h" "30 → 30m" */
export function formatPracticeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
