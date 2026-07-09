"use client";

/* eslint-disable @next/next/no-img-element */
// 写真の添付欄。カメラ撮影/選択した画像を端末側で縮小して data URL 化し、
// hidden input（name）に入れてサーバーアクションへ送る。保存先はDBのtext列。

import { useState } from "react";

export function PhotoInput({
  name,
  initial = "",
  label = "写真を選ぶ・撮影する",
}: {
  name: string;
  initial?: string;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState(initial);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setDataUrl(await downscale(file, 1400, 0.72));
    } catch {
      // 失敗しても未添付として続行
    }
    setBusy(false);
  };

  return (
    <div>
      <input type="hidden" name={name} value={dataUrl} />
      {dataUrl ? (
        <div className="space-y-2">
          <img
            src={dataUrl}
            alt="添付写真"
            className="w-full max-h-80 object-contain rounded-xl border border-stone-200 bg-white"
          />
          <button
            type="button"
            onClick={() => setDataUrl("")}
            className="text-xs font-bold text-red-500 underline"
          >
            写真を削除
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-white px-4 py-6 text-sm font-bold text-brand-600 cursor-pointer">
          {busy ? "読み込み中…" : `＋ ${label}`}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            disabled={busy}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

/** 画像を最大辺 maxDim に縮小して JPEG の data URL にする */
async function downscale(file: File, maxDim: number, quality: number): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
