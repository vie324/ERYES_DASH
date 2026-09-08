"use client";

// ファイル（PDF）の添付欄。議事録の資料など、写真ではないものを載せるときに使う。
// ファイルを data URL にして hidden input（name）と、元のファイル名（name_name）で送る。

import { useState } from "react";
import { Icon } from "@/components/icons";

/** 添付できるファイルの上限（DBのtext列に data URL で入れるため大きすぎるものは断る） */
export const ATTACH_FILE_MAX_BYTES = 4_000_000;

export function FileInput({
  name,
  initial = "",
  initialName = "",
  accept = "application/pdf",
  label = "PDFを選ぶ",
}: {
  name: string;
  initial?: string;
  initialName?: string;
  accept?: string;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState(initial);
  const [fileName, setFileName] = useState(initialName);
  const [error, setError] = useState("");

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.size > ATTACH_FILE_MAX_BYTES) {
      setError("ファイルが大きすぎます（4MBまで）。小さくしてからもう一度お試しください。");
      return;
    }
    try {
      setDataUrl(await readAsDataUrl(file));
      setFileName(file.name.slice(0, 120));
    } catch {
      setError("ファイルを読み込めませんでした");
    }
  };

  return (
    <div>
      <input type="hidden" name={name} value={dataUrl} />
      <input type="hidden" name={`${name}_name`} value={fileName} />
      {dataUrl ? (
        <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5">
          <Icon name="fileText" className="w-5 h-5 text-brand-500 shrink-0" />
          <span className="text-sm font-bold text-ink-800 truncate flex-1">{fileName || "ファイル"}</span>
          <button
            type="button"
            onClick={() => {
              setDataUrl("");
              setFileName("");
            }}
            className="text-xs font-bold text-red-500 underline shrink-0"
          >
            削除
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-300 bg-white px-3 py-4 text-sm font-bold text-brand-600 cursor-pointer">
          📎 {label}
          <input type="file" accept={accept} onChange={onPick} className="hidden" />
        </label>
      )}
      {error && <p className="text-xs font-bold text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}
