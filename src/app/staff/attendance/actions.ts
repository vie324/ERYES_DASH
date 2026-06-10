"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { distanceMeters } from "@/lib/geo";
import type { PunchType } from "@/lib/data/types";

export interface PunchResult {
  ok: boolean;
  distanceM: number;
  radiusM: number;
  message: string;
}

/**
 * 打刻：店舗座標から許容半径（既定100m）以内なら成立。
 * 圏外の場合も監査用に is_valid=false で記録は残すが、労働時間には集計しない（打刻不成立扱い）。
 */
export async function punchAction(punchType: PunchType, lat: number, lng: number): Promise<PunchResult> {
  const session = await requireSession();
  const db = getDataStore();
  const store = await db.getStore();

  if (!store.attendanceEnabled) {
    return { ok: false, distanceM: 0, radiusM: store.gpsRadiusM, message: "勤怠機能は現在オフに設定されています" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, distanceM: 0, radiusM: store.gpsRadiusM, message: "位置情報を取得できませんでした" };
  }

  const distanceM = distanceMeters(store.lat, store.lng, lat, lng);
  const isValid = distanceM <= store.gpsRadiusM;

  await db.createAttendance({
    staffId: session.staffId,
    storeId: store.id,
    punchType,
    punchedAt: new Date(),
    lat,
    lng,
    distanceM,
    isValid,
  });

  revalidatePath("/staff/attendance");

  const label = punchType === "in" ? "出勤" : "退勤";
  return isValid
    ? { ok: true, distanceM, radiusM: store.gpsRadiusM, message: `${label}を打刻しました（店舗から${distanceM}m）` }
    : {
        ok: false,
        distanceM,
        radiusM: store.gpsRadiusM,
        message: `打刻できませんでした。店舗から${distanceM}m離れています（${store.gpsRadiusM}m以内で打刻してください）`,
      };
}
