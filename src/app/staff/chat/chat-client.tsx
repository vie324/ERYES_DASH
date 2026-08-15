"use client";

/* eslint-disable @next/next/no-img-element */
// チャットのクライアント部品：
//  ・AutoRefresh …… 数秒ごとに router.refresh() して新着を取り込む（スクロール位置は保たれる）
//  ・ScrollToBottom … 開いたとき最新メッセージまでスクロール
//  ・ChatComposer …… 送信フォーム（Enter送信・画像添付・送信後に入力をクリア）

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
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

export function ChatComposer({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const text = body.trim();
    if ((!text && !image) || pending) return;
    const fd = new FormData();
    fd.set("room_id", roomId);
    fd.set("body", text);
    fd.set("image", image);
    startTransition(async () => {
      await sendMessageAction(fd);
      setBody("");
      setImage("");
      router.refresh();
      // 送信後は最下部へ
      requestAnimationFrame(() => {
        window.scrollTo({ top: document.body.scrollHeight });
      });
    });
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setImage(await downscale(file, 1200, 0.7));
    } catch {
      // 失敗しても未添付として続行
    }
    setBusy(false);
  };

  return (
    <div className="fixed bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] inset-x-0 lg:left-64 z-20 border-t border-brand-200/70 bg-brand-50/95 backdrop-blur-md px-3 py-2">
      <div className="mx-auto max-w-3xl">
        {image && (
          <div className="mb-2 flex items-center gap-2">
            <img src={image} alt="添付画像" className="h-16 rounded-lg border border-ink-200" />
            <button
              type="button"
              onClick={() => setImage("")}
              className="text-xs font-bold text-red-500 underline"
            >
              添付を取り消す
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600 cursor-pointer active:bg-brand-100"
            aria-label="画像を添付"
          >
            {busy ? (
              <span className="text-[10px] font-bold">…</span>
            ) : (
              <Icon name="plus" className="w-5 h-5" />
            )}
            <input type="file" accept="image/*" onChange={onPickImage} disabled={busy} className="hidden" />
          </label>
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
            disabled={pending || (!body.trim() && !image)}
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
