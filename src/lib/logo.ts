// ロゴ画像の解決（サーバー専用）。
// メインブランドは ENi（ヘアサロン）。マークは両ブランド共通で、ワードマークだけが違う。
// EREYS（アイサロン）を選んでいるときだけ EREYS のロゴに切り替える。
// EREYSの正式ロゴ（public/logo.png＝背景透過済み）があればそれを優先する。
// ENiの正式ロゴ画像を受領したら public/logo-eni.png を置くだけで自動的に優先表示される。

import { existsSync } from "fs";
import path from "path";
import type { Brand } from "@/lib/brand";

function hasFile(name: string): boolean {
  return existsSync(path.join(process.cwd(), "public", name));
}

/** ヘッダーなど横長表示用。brand未指定時はメインブランド（ENi） */
export function getLogoSrc(brand?: Brand | null): string {
  if (brand === "eyes") {
    return hasFile("logo.png") ? "/logo.png" : "/logo.svg";
  }
  return hasFile("logo-eni.png") ? "/logo-eni.png" : "/logo-eni.svg";
}

/** スプラッシュ・ログインなど大きく見せる用。brand未指定時はメインブランド（ENi） */
export function getLogoFullSrc(brand?: Brand | null): string {
  if (brand === "eyes") {
    return hasFile("logo.png") ? "/logo.png" : "/logo-full.svg";
  }
  return hasFile("logo-eni.png") ? "/logo-eni.png" : "/logo-eni-full.svg";
}

/** ロゴのalt・表示名 */
export function getBrandName(brand?: Brand | null): string {
  return brand === "eyes" ? "EREYS" : "ENi";
}
