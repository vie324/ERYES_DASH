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
 * 打刻：スタッフは複数店舗を行き来するため、勤怠運用中の店舗のうち「最寄りの店舗」で判定する。
 * 最寄り店舗の許容半径（既定100m）以内なら成立し、その店舗のIDを記録する。
 * 圏外の場合も監査用に is_valid=false で記録は残すが、労働時間には集計しない（打刻不成立扱い）。
 */
export async function punchAction(punchType: PunchType, lat: number, lng: number): Promise<PunchResult> {
  const session = await requireSession();
  const db = getDataStore();
  const stores = (await db.listStores()).filter((s) => s.attendanceEnabled);

  if (stores.length === 0) {
    return { ok: false, distanceM: 0, radiusM: 0, message: "勤怠機能は現在オフに設定されています" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, distanceM: 0, radiusM: stores[0].gpsRadiusM, message: "位置情報を取得できませんでした" };
  }

  // 最寄りの店舗を特定
  const nearest = stores
    .map((store) => ({ store, distanceM: distanceMeters(store.lat, store.lng, lat, lng) }))
    .sort((a, b) => a.distanceM - b.distanceM)[0];

  const { store, distanceM } = nearest;
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
    ? { ok: true, distanceM, radiusM: store.gpsRadiusM, message: `${label}を打刻しました（${store.name}から${distanceM}m）` }
    : {
        ok: false,
        distanceM,
        radiusM: store.gpsRadiusM,
        message: `打刻できませんでした。最寄りの${store.name}から${distanceM}m離れています（${store.gpsRadiusM}m以内で打刻してください）`,
      };
}
