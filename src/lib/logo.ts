// ロゴ画像の解決（サーバー専用）。
// 正式ロゴ（public/logo.png＝背景透過済み）が置かれていればそれを優先し、
// 無い間は再現SVG（public/logo.svg / logo-full.svg）で表示する。
// 透過処理は scripts/make-logo-transparent.mjs を参照。

import { existsSync } from "fs";
import path from "path";

function hasPng(): boolean {
  return existsSync(path.join(process.cwd(), "public", "logo.png"));
}

/** ヘッダーなど横長表示用 */
export function getLogoSrc(): string {
  return hasPng() ? "/logo.png" : "/logo.svg";
}

/** スプラッシュ・ログインなど大きく見せる用 */
export function getLogoFullSrc(): string {
  return hasPng() ? "/logo.png" : "/logo-full.svg";
}
