"use client";

/* eslint-disable @next/next/no-img-element */
// トークルームのクライアント部品：
//  ・AutoRefresh …… 数秒ごとに router.refresh() して新着を取り込む（スクロール位置は保たれる）
//  ・ScrollToBottom … 開いたとき最新メッセージまでスクロール
//  ・ChatComposer …… 送信フォーム（Enter送信・写真・PDF・メンション・返信）
//  ・RoomSearch …… トーク一覧の絞り込み
//  ・MemberPicker … グループのメンバー選択（検索つき）
//  ・Lightbox …… 写真の拡大表示

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { CHAT_FILE_MAX_BYTES } from "@/lib/chat";
import { sendMessageAction } from "./actions";

/** 新着の自動取り込み（ポーリング）。ページを開いている間だけ動く */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

/** 初回表示で最新（最下部）までスクロール */
export function ScrollToBottom() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, []);
  return <div ref={ref} />;
}

/** 画像を最大辺 maxDim に縮小して JPEG の data URL にする */
async function downscale(file: File, maxDim: number, quality: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
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

/** ファイルをそのまま data URL にする（PDF用） */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export interface ComposerMember {
  id: string;
  name: string;
}

export interface ReplyTarget {
  id: string;
  senderName: string;
  preview: string;
}

export function ChatComposer({
  roomId,
  members,
  reply,
}: {
  roomId: string;
  /** メンション候補（自分以外のルームメンバー） */
  members: ComposerMember[];
  /** 返信先（?reply=... で指定されているとき） */
  reply?: ReplyTarget | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = Boolean(body.trim() || image || file) && !pending && !busy;

  const send = () => {
    if (!canSend) return;
    const fd = new FormData();
    fd.set("room_id", roomId);
    fd.set("body", body.trim());
    fd.set("image", image);
    fd.set("file", file);
    fd.set("file_name", fileName);
    fd.set("reply_to", reply?.id ?? "");
    startTransition(async () => {
      await sendMessageAction(fd);
      setBody("");
      setImage("");
      setFile("");
      setFileName("");
      // 返信モードを解除して最新まで送る
      router.replace(`/staff/chat/${roomId}`);
      router.refresh();
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }));
    });
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      setImage(await downscale(picked, 1200, 0.7));
      setFile("");
      setFileName("");
    } catch {
      setError("写真を読み込めませんでした");
    }
    setBusy(false);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      setError("送れるファイルはPDFだけです");
      return;
    }
    if (picked.size > CHAT_FILE_MAX_BYTES) {
      setError(`ファイルが大きすぎます（${Math.round(CHAT_FILE_MAX_BYTES / 1_000_000)}MBまで）`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setFile(await readAsDataUrl(picked));
      setFileName(picked.name);
      setImage("");
    } catch {
      setError("ファイルを読み込めませんでした");
    }
    setBusy(false);
  };

  /** @名前 を本文に差し込む */
  const insertMention = (name: string) => {
    const flat = name.replace(/\s+/g, "");
    setBody((prev) => `${prev}${prev.endsWith(" ") || prev === "" ? "" : " "}@${flat} `);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="fixed bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] inset-x-0 lg:left-64 z-20 border-t border-brand-200/70 bg-brand-50/95 backdrop-blur-md px-3 py-2">
      <div className="mx-auto max-w-3xl">
        {/* 返信先 */}
        {reply && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-brand-400 bg-white px-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold text-brand-700">
                {reply.senderName}さんに返信
              </span>
              <span className="block text-xs text-ink-500 truncate">{reply.preview}</span>
            </span>
            <a
              href={`/staff/chat/${roomId}`}
              className="shrink-0 text-xs font-bold text-ink-400"
              aria-label="返信をやめる"
            >
              ✕
            </a>
          </div>
        )}

        {/* 添付のプレビュー */}
        {image && (
          <div className="mb-2 flex items-center gap-2">
            <img src={image} alt="添付画像" className="h-16 rounded-lg border border-ink-200" />
            <button type="button" onClick={() => setImage("")} className="text-xs font-bold text-red-500 underline">
              添付を取り消す
            </button>
          </div>
        )}
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5">
            <Icon name="fileText" className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-xs font-bold text-ink-700">{fileName}</span>
            <button
              type="button"
              onClick={() => {
                setFile("");
                setFileName("");
              }}
              className="shrink-0 text-xs font-bold text-red-500 underline"
            >
              取り消す
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-[11px] font-bold text-red-500">{error}</p>}

        {/* メンション候補 */}
        {mentionOpen && members.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl border border-brand-200 bg-white p-2 max-h-32 overflow-y-auto scroll-slim">
            <button
              type="button"
              onClick={() => insertMention("all")}
              className="chip chip-active"
            >
              @全員
            </button>
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => insertMention(m.name)} className="chip">
                @{m.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {/* 写真 */}
          <label
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600 cursor-pointer active:bg-brand-100"
            aria-label="写真を添付"
            title="写真を送る"
          >
            {busy ? <span className="text-[10px] font-bold">…</span> : <Icon name="plus" className="w-5 h-5" />}
            <input type="file" accept="image/*" onChange={onPickImage} disabled={busy} className="hidden" />
          </label>
          {/* PDF */}
          <label
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600 cursor-pointer active:bg-brand-100"
            aria-label="PDFを添付"
            title="PDFを送る"
          >
            <Icon name="fileText" className="w-5 h-5" />
            <input type="file" accept="application/pdf" onChange={onPickFile} disabled={busy} className="hidden" />
          </label>
          {/* メンション */}
          <button
            type="button"
            onClick={() => setMentionOpen((v) => !v)}
            aria-label="メンションする"
            title="メンションする"
            className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border text-base font-bold ${
              mentionOpen
                ? "border-brand-500 bg-brand-100 text-brand-800"
                : "border-brand-200 bg-white text-brand-600"
            }`}
          >
            @
          </button>

          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // PCではEnterで送信（Shift+Enterで改行）。スマホは送信ボタンで
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="メッセージを入力"
            className="input flex-1 !min-h-11 max-h-32 resize-none !py-2.5"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="送信"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Icon name="send" className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** トーク一覧の絞り込み（名前・最後のメッセージを対象にその場で隠す） */
export function RoomSearch() {
  const [q, setQ] = useState("");

  useEffect(() => {
    const needle = q.trim().toLowerCase();
    const list = document.getElementById("room-list");
    if (!list) return;
    for (const el of Array.from(list.querySelectorAll<HTMLElement>("[data-room-search]"))) {
      const hay = el.dataset.roomSearch ?? "";
      el.style.display = !needle || hay.includes(needle) ? "" : "none";
    }
  }, [q]);

  return (
    <div className="relative mb-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="トークを探す（名前・本文）"
        className="input !min-h-11 !py-2.5 pr-10 text-sm"
        aria-label="トークを探す"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 font-bold"
          aria-label="検索をやめる"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** グループのメンバー選択（人数が増えても探せるよう検索つき） */
export function MemberPicker({
  staff,
  label,
  selected = [],
}: {
  staff: ComposerMember[];
  label: string;
  selected?: string[];
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? staff.filter((s) => s.name.toLowerCase().includes(needle)) : staff;
  }, [q, staff]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="label !mb-0 flex-1">{label}</p>
        <span className="text-[11px] font-bold text-brand-700">{picked.length}人</span>
        <button
          type="button"
          onClick={() => setPicked(picked.length === staff.length ? [] : staff.map((s) => s.id))}
          className="text-[11px] font-bold text-brand-700 underline"
        >
          {picked.length === staff.length ? "全解除" : "全員"}
        </button>
      </div>
      {staff.length > 6 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前で探す"
          className="input !min-h-10 !py-2 text-sm mb-2"
          aria-label="メンバーを探す"
        />
      )}
      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto scroll-slim">
        {shown.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold text-ink-700 has-checked:border-brand-400 has-checked:bg-brand-50"
          >
            <input
              type="checkbox"
              name="members"
              value={s.id}
              checked={picked.includes(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 accent-brand-500 shrink-0"
            />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** 写真をタップして拡大表示（写真一覧・吹き出しの両方で使う） */
export function Lightbox({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={`${alt}を拡大`}>
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          role="presentation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain rounded-lg" />
          <span className="absolute top-4 right-4 text-white text-2xl font-bold">✕</span>
        </div>
      )}
    </>
  );
}
