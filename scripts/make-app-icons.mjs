#!/usr/bin/env node
// ホーム画面用のアプリアイコン（PNG）を public/logo.png から生成する。
// 使い方: node scripts/make-app-icons.mjs
// 出力: public/icons/icon-192.png / icon-512.png / apple-touch-icon.png（180）/ badge-72.png（Android通知用の単色）
// ロゴを差し替えたら、もう一度実行して上書きしてください。

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { PNG } from "pngjs";

const BG = [0xf8, 0xf5, 0xef]; // 背景（アプリの地色）
const logo = PNG.sync.read(readFileSync("public/logo.png"));
mkdirSync("public/icons", { recursive: true });

/** ロゴを枠内に収めて中央に置いたアイコンを作る（ボックスフィルタで縮小） */
function makeIcon(size, padRatio) {
  const out = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) {
    out.data[i * 4] = BG[0];
    out.data[i * 4 + 1] = BG[1];
    out.data[i * 4 + 2] = BG[2];
    out.data[i * 4 + 3] = 255;
  }
  const inner = size * (1 - padRatio * 2);
  const scale = Math.min(inner / logo.width, inner / logo.height);
  const w = Math.round(logo.width * scale);
  const h = Math.round(logo.height * scale);
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 出力1ピクセルに対応する元画像の範囲を平均する
      const sx0 = Math.floor(x / scale), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale));
      const sy0 = Math.floor(y / scale), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < Math.min(sy1, logo.height); sy++) {
        for (let sx = sx0; sx < Math.min(sx1, logo.width); sx++) {
          const i = (sy * logo.width + sx) * 4;
          const al = logo.data[i + 3] / 255;
          r += logo.data[i] * al; g += logo.data[i + 1] * al; b += logo.data[i + 2] * al; a += al; n++;
        }
      }
      if (n === 0 || a === 0) continue;
      const alpha = a / n;
      const o = ((oy + y) * size + (ox + x)) * 4;
      out.data[o] = Math.round((r / a) * alpha + BG[0] * (1 - alpha));
      out.data[o + 1] = Math.round((g / a) * alpha + BG[1] * (1 - alpha));
      out.data[o + 2] = Math.round((b / a) * alpha + BG[2] * (1 - alpha));
    }
  }
  return PNG.sync.write(out);
}

/** Android の通知バッジ用（白の単色シルエット：src/app/icon.svg と同じ「輪と線」） */
function makeBadge(size) {
  const out = new PNG({ width: size, height: size });
  const k = size / 64; // icon.svg は 64x64 基準
  const cx = 32 * k, cy = 32 * k, r = 19 * k, stroke = 3 * k;
  const lx1 = 12 * k, ly1 = 53 * k, lx2 = 44 * k, ly2 = 29 * k;
  const ss = 4; // スーパーサンプリング
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const px = x + (i + 0.5) / ss, py = y + (j + 0.5) / ss;
          const dc = Math.abs(Math.hypot(px - cx, py - cy) - r);
          const vx = lx2 - lx1, vy = ly2 - ly1;
          const t = Math.max(0, Math.min(1, ((px - lx1) * vx + (py - ly1) * vy) / (vx * vx + vy * vy)));
          const dl = Math.hypot(px - (lx1 + t * vx), py - (ly1 + t * vy));
          if (dc <= stroke / 2 || dl <= stroke / 2) hit++;
        }
      }
      const o = (y * size + x) * 4;
      out.data[o] = 255; out.data[o + 1] = 255; out.data[o + 2] = 255;
      out.data[o + 3] = Math.round((hit / (ss * ss)) * 255);
    }
  }
  return PNG.sync.write(out);
}

writeFileSync("public/icons/icon-192.png", makeIcon(192, 0.16));
writeFileSync("public/icons/icon-512.png", makeIcon(512, 0.16));
writeFileSync("public/icons/apple-touch-icon.png", makeIcon(180, 0.16));
writeFileSync("public/icons/badge-72.png", makeBadge(72));
console.log("public/icons/ にアイコンを出力しました");
