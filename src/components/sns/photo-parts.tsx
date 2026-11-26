"use client";

/* eslint-disable @next/next/no-img-element */
// 社内SNSの写真：投稿の欄（最大4枚・端末で縮めてから送る）と、タイムラインの写真（タップで大きく見る）。

import { useState } from "react";
import { downscale } from "@/components/photo-input";

export function MultiPhotoInput({ name, max = 4 }: { name: string; max?: number }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, max - photos.length);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    const added: string[] = [];
    for (const f of files) {
      try {
        added.push(await downscale(f, 1200, 0.72));
      } catch {
        // 読めなかった写真は飛ばす
      }
    }
    setPhotos((p) => [...p, ...added].slice(0, max));
    setBusy(false);
  };

  return (
    <div>
      {photos.map((p, i) => (
        <input key={i} type="hidden" name={name} value={p} />
      ))}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {photos.map((p, i) => (
            <div key={i} className="relative aspect-square">
              <img src={p} alt={`写真${i + 1}`} className="w-full h-full object-cover rounded-xl border border-ink-200" />
              <button
                type="button"
                onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-ink-900 text-white text-xs font-bold"
                aria-label={`写真${i + 1}を外す`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {photos.length < max && (
        <label className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-300 bg-white px-3 py-4 text-sm font-bold text-brand-600 cursor-pointer">
          {busy ? "読み込み中…" : `＋ 写真を選ぶ（あと${max - photos.length}枚）`}
          <input type="file" accept="image/*" multiple onChange={onPick} disabled={busy} className="hidden" />
        </label>
      )}
    </div>
  );
}

/** タイムラインの写真。タップで大きく表示（長押しの保存メニューは出さない） */
export function PhotoGrid({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (photos.length === 0) return null;
  const cols = photos.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <>
      <div className={`grid ${cols} gap-1.5 mt-2.5`}>
        {photos.map((p, i) => (
          <button key={i} type="button" onClick={() => setOpen(p)} className="block line-no-callout">
            <img
              src={p}
              alt={`写真${i + 1}`}
              className={`w-full ${photos.length === 1 ? "max-h-80" : "aspect-square"} object-cover rounded-xl bg-ink-50`}
            />
          </button>
        ))}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          onClick={() => setOpen(null)}
          role="dialog"
          aria-label="写真を大きく表示"
        >
          <img src={open} alt="写真" className="max-w-full max-h-full object-contain line-no-callout" />
          <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-lg" aria-label="閉じる">
            ×
          </button>
        </div>
      )}
    </>
  );
}
