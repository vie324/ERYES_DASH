#!/usr/bin/env node
// ロゴ画像（白背景のPNG/JPEG）を背景透過＋余白トリミングして public/logo.png に出力する。
// 使い方: node scripts/make-logo-transparent.mjs <入力画像のパス>
//   例:   node scripts/make-logo-transparent.mjs assets/logo-original.jpg
// 出力後はアプリが自動で public/logo.png を優先表示する（コード変更不要）。

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const input = process.argv[2] ?? "assets/logo-original.jpg";
const output = "public/logo.png";

// PNG/JPEGをマジックバイトで判定して RGBA に展開する
function loadImage(file) {
  const buf = readFileSync(file);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const img = jpeg.decode(buf, { useTArray: true });
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error("PNGまたはJPEG形式の画像を指定してください");
}

let img;
try {
  img = loadImage(input);
} catch (e) {
  console.error(`入力画像を読み込めませんでした: ${input}`);
  console.error(String(e));
  process.exit(1);
}

const { width, height, data } = img;

// 0. スクリーンショット由来の「全幅の暗い線」アーティファクト行を背景扱いにする
const artifactRows = new Set();
for (let y = 0; y < height; y++) {
  let dark = 0;
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 100) dark++;
  }
  if (dark > width * 0.9) artifactRows.add(y);
}
if (artifactRows.size > 0) {
  console.log(`アーティファクト行を除去: ${[...artifactRows].join(", ")}`);
}

// 1. 白〜ほぼ白の画素を透明にする（境界はなだらかに半透明化してギザギザを防ぐ）
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (artifactRows.has(y)) {
      data[i + 3] = 0;
      continue;
    }
    const whiteness = Math.min(data[i], data[i + 1], data[i + 2]); // 最小チャンネルが高い＝白に近い
    let alpha;
    if (whiteness >= 248) alpha = 0;
    else if (whiteness <= 200) alpha = 255;
    else alpha = Math.round((255 * (248 - whiteness)) / 48);
    data[i + 3] = Math.min(data[i + 3], alpha); // 元から透明な部分はそのまま
  }
}

// 2. 余白をトリミング（不透明画素のバウンディングボックス＋少し余白）
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 40) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) {
  console.error("不透明な画素が見つかりません（画像全体が白？）");
  process.exit(1);
}
const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);

const outW = maxX - minX + 1;
const outH = maxY - minY + 1;
const out = new PNG({ width: outW, height: outH });
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const src = ((y + minY) * width + (x + minX)) * 4;
    const dst = (y * outW + x) * 4;
    out.data[dst] = data[src];
    out.data[dst + 1] = data[src + 1];
    out.data[dst + 2] = data[src + 2];
    out.data[dst + 3] = data[src + 3];
  }
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, PNG.sync.write(out));
console.log(`完了: ${output}（${outW}×${outH}・背景透過済み）`);
console.log("アプリは public/logo.png を自動で優先表示します。");
