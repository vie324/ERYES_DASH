"use client";

// 依頼20：管理画面から動画を上げる部品。動画はアプリのサーバーを通さず、端末から配信サービス（Cloudflare Stream
// または Supabase Storage の非公開バケット）へ直接送る（大きなファイルでも止まらないように）。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishVideoUploadAction, prepareVideoUploadAction } from "@/app/admin/growth/actions";

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}

function send(method: "POST" | "PUT", url: string, body: FormData, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(body);
  });
}

export function VideoUpload({ providerLabel }: { providerLabel: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const start = async () => {
    setError("");
    setMessage("");
    if (!file) return setError("動画のファイルを選んでください");
    if (!title.trim()) return setError("動画の名前を入れてください");
    if (file.size > 200 * 1024 * 1024) return setError("200MBまでの動画にしてください（長い動画は分けて上げてください）");
    setPct(0);
    const ticket = await prepareVideoUploadAction(title, file.name, description);
    if (!ticket.ok) {
      setPct(null);
      return setError(ticket.error);
    }
    const duration = await readDuration(file);
    const body = new FormData();
    if (ticket.provider === "supabase") {
      body.append("cacheControl", "3600");
      body.append("", file);
    } else {
      body.append("file", file);
    }
    const ok = await send(ticket.method, ticket.uploadUrl, body, setPct);
    const done = await finishVideoUploadAction(ticket.id, duration, !ok);
    setPct(null);
    if (!done.ok) return setError(done.message);
    setMessage(done.message);
    setFile(null);
    setTitle("");
    setDescription("");
    router.refresh();
  };

  return (
    <div className="card !p-3.5 space-y-2">
      <p className="text-sm font-bold">動画をアップロード（{providerLabel}）</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="動画の名前（例：シャンプーの基本）" maxLength={100} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-16" placeholder="説明（任意）" maxLength={1000} />
      <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      {pct !== null && (
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden" aria-label="アップロードの進み具合">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <button type="button" onClick={() => void start()} disabled={pct !== null} className="btn-primary w-full">
        {pct !== null ? `アップロード中… ${pct}%` : "アップロードする"}
      </button>
      {message && <p className="text-xs font-bold text-emerald-700">{message}</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
