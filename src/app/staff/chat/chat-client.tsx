"use client";

/* eslint-disable @next/next/no-img-element */
// トークルームのクライアント部品（見た目・操作はLINEに合わせる）：
//  ・AutoRefresh ……… 数秒ごとに router.refresh() して新着を取り込む
//  ・ChatRoomFrame …… トークルームを画面いっぱいに出す枠（スマホのキーボードが出ても見出しと入力欄が隠れない）
//  ・ChatRoomProvider … 返信先・開いているメニュー・スクロールを部品どうしで共有する
//  ・ChatScroller ……… メッセージ一覧のスクロール（開いたら最新。送信・新着で最新へ。読み返し中は位置を保つ）
//  ・MessageActions … 吹き出しをタップ（写真は長押し）で出すメニュー（リアクション・リプライ・コピー・ノート・送信取消）
//  ・ChatComposer …… 入力欄（Enterは改行・送信は送信ボタン。PCは Ctrl/⌘＋Enter でも送信。写真・PDF・メンション・返信）
//  ・RoomMenu ………… 見出し右の「≡」（トーク・ノート・写真・ファイル・メンバー）
//  ・RoomSearch …… トーク一覧の絞り込み
//  ・MemberPicker … グループのメンバー選択（検索つき）
//  ・Lightbox …… 写真の拡大表示

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { CHAT_FILE_MAX_BYTES, CHAT_REACTION_EMOJIS } from "@/lib/chat";
import {
  deleteMessageAction,
  sendMessageAction,
  toggleAnnounceAction,
  togglePinAction,
  toggleReactionAction,
} from "./actions";

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

// ---------------------------------------------------------------------------
// 画面の枠
// ---------------------------------------------------------------------------

/**
 * トークルームの枠（LINEのように画面いっぱい）。
 * スマホでキーボードが出ると、見えている範囲（visualViewport）に合わせて枠を縮めるので、
 * 見出しと入力欄がキーボードの裏に隠れない。
 */
export function ChatRoomFrame({
  tone,
  children,
}: {
  /** talk＝トーク（LINEの青い背景）／sheet＝ノート・写真などの一覧（白系） */
  tone: "talk" | "sheet";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      el.style.height = `${vv.height}px`;
      el.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      cancelAnimationFrame(raf);
      el.style.height = "";
      el.style.transform = "";
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`line-talk fixed inset-x-0 top-0 bottom-0 lg:left-64 z-40 flex flex-col overflow-hidden ${
        tone === "talk" ? "bg-[var(--line-bg)]" : "bg-[#f5f6f8]"
      }`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 部品どうしで共有する状態（返信先・開いているメニュー・スクロール・お知らせ）
// ---------------------------------------------------------------------------

export interface ComposerMember {
  id: string;
  name: string;
}

export interface ReplyTarget {
  id: string;
  senderName: string;
  preview: string;
}

interface ChatRoomContextValue {
  reply: ReplyTarget | null;
  setReply: (reply: ReplyTarget | null) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  scrollToBottom: () => void;
  registerScroller: (fn: () => void) => void;
  focusComposer: () => void;
  registerComposer: (fn: () => void) => void;
  toast: (message: string) => void;
}

const ChatRoomContext = createContext<ChatRoomContextValue | null>(null);

function useChatRoom(): ChatRoomContextValue {
  const value = useContext(ChatRoomContext);
  if (!value) throw new Error("ChatRoomProvider の中で使ってください");
  return value;
}

export function ChatRoomProvider({ children }: { children: React.ReactNode }) {
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toastText, setToastText] = useState("");
  const scrollerRef = useRef<() => void>(() => {});
  const composerRef = useRef<() => void>(() => {});
  const toastTimer = useRef(0);

  const scrollToBottom = useCallback(() => scrollerRef.current(), []);
  const registerScroller = useCallback((fn: () => void) => {
    scrollerRef.current = fn;
  }, []);
  const focusComposer = useCallback(() => composerRef.current(), []);
  const registerComposer = useCallback((fn: () => void) => {
    composerRef.current = fn;
  }, []);
  const toast = useCallback((message: string) => {
    setToastText(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(""), 1600);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const value = useMemo(
    () => ({
      reply,
      setReply,
      openMenuId,
      setOpenMenuId,
      scrollToBottom,
      registerScroller,
      focusComposer,
      registerComposer,
      toast,
    }),
    [reply, openMenuId, scrollToBottom, registerScroller, focusComposer, registerComposer, toast]
  );

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
      {toastText && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-4 py-2 text-sm font-bold text-white"
        >
          {toastText}
        </div>
      )}
    </ChatRoomContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// メッセージ一覧のスクロール
// ---------------------------------------------------------------------------

/** 最下部から何px以内なら「最新を見ている」とみなすか */
const NEAR_BOTTOM_PX = 80;

/**
 * メッセージ一覧のスクロール枠。
 *  ・開いたときは最新（いちばん下）を表示
 *  ・自分が送ったとき、または最新を見ているときに新着が来たら、最新まで送る
 *  ・上の方を読み返しているときは位置を動かさず、「新着メッセージ」ボタンを出す
 * 画面全体ではなくこの枠だけがスクロールするので、送信や自動更新で先頭に戻ることはない。
 */
export function ChatScroller({
  lastKey,
  lastMine,
  children,
}: {
  /** いちばん新しいメッセージのID（変わったら新着） */
  lastKey: string;
  /** いちばん新しいメッセージが自分のものか */
  lastMine: boolean;
  children: React.ReactNode;
}) {
  const { registerScroller } = useChatRoom();
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevKeyRef = useRef(lastKey);
  const [hasNew, setHasNew] = useState(false);

  const toBottom = useCallback((smooth: boolean) => {
    const box = boxRef.current;
    if (!box) return;
    atBottomRef.current = true;
    setHasNew(false);
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // 開いたとき：描画前に最新まで送っておく（一瞬先頭が見えてしまわないように）
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, []);

  useEffect(() => {
    registerScroller(() => toBottom(true));
  }, [registerScroller, toBottom]);

  // 新着が来たとき
  useLayoutEffect(() => {
    if (prevKeyRef.current === lastKey) return;
    prevKeyRef.current = lastKey;
    if (lastMine || atBottomRef.current) toBottom(false);
    else setHasNew(true);
  }, [lastKey, lastMine, toBottom]);

  // 写真の読み込み・入力欄の高さの変化で枠の大きさが変わっても、最新を見ていたら最新のまま
  useEffect(() => {
    const box = boxRef.current;
    const content = box?.firstElementChild;
    if (!box || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) box.scrollTop = box.scrollHeight;
    });
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (atBottom) setHasNew(false);
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={boxRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain">
        <div>{children}</div>
      </div>
      {hasNew && (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-[#333] shadow-lg"
        >
          <Icon name="chevronDown" className="w-4 h-4 text-[var(--line-green)]" />
          新着メッセージ
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 吹き出しのメニュー（タップ／長押し）
// ---------------------------------------------------------------------------

/** 長押しとみなす時間（ms） */
const LONG_PRESS_MS = 450;

export function MessageActions({
  messageId,
  roomId,
  mine,
  text,
  senderName,
  preview,
  pinned,
  canAnnounce,
  announced,
  className = "",
  children,
}: {
  messageId: string;
  roomId: string;
  mine: boolean;
  /** コピーする本文（写真だけのメッセージは空） */
  text: string;
  senderName: string;
  /** リプライのときに入力欄の上に出す引用 */
  preview: string;
  pinned: boolean;
  /** アナウンス（トップに掲示）を出せるか（全体共有 × 幹部） */
  canAnnounce: boolean;
  announced: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { openMenuId, setOpenMenuId, setReply, focusComposer, toast } = useChatRoom();
  const open = openMenuId === messageId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef(0);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const [placeAbove, setPlaceAbove] = useState(false);

  const close = useCallback(() => setOpenMenuId(null), [setOpenMenuId]);
  const openMenu = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    // 画面の下の方の吹き出しは、メニューを上に出す（入力欄に隠れないように）
    setPlaceAbove(rect ? window.innerHeight - rect.bottom < 240 && rect.top > 240 : false);
    setOpenMenuId(messageId);
  };

  // メニューの外を触ったら閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  const clearPress = () => {
    window.clearTimeout(pressTimer.current);
    pressStart.current = null;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
    close();
  };

  return (
    <div
      ref={wrapRef}
      className={`relative [@media(pointer:coarse)]:select-none ${className}`}
      onPointerDown={(e) => {
        longPressed.current = false;
        if (e.button !== 0 || isOutsideMenuTarget(e.target)) return;
        pressStart.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(pressTimer.current);
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          openMenu();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const start = pressStart.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clearPress();
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={(e) => {
        if (isOutsideMenuTarget(e.target)) return;
        e.preventDefault();
        openMenu();
      }}
      onClickCapture={(e) => {
        // 長押しでメニューを出した直後のタップは、写真の拡大などに渡さない
        if (longPressed.current) {
          longPressed.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // 写真・ファイル・メニューのボタンなどは、それぞれの動きを優先する
        if (isOutsideMenuTarget(target) || target.closest("a,button,input,label,textarea,select,form")) return;
        // PCで文字を選んでいるときはメニューを出さない（選んだ文字をコピーできるように）
        if (window.getSelection()?.toString()) return;
        if (open) close();
        else openMenu();
      }}
    >
      {children}

      {open && (
        <div
          role="menu"
          className={`absolute z-30 w-[16.5rem] max-w-[82vw] rounded-2xl bg-[#262626] p-2 text-white shadow-2xl select-none ${
            placeAbove ? "bottom-full mb-2" : "top-full mt-2"
          } ${mine ? "right-0" : "left-0"}`}
        >
          {/* リアクション */}
          <div className="flex items-center justify-between border-b border-white/10 px-0.5 pb-2">
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <form key={emoji} action={toggleReactionAction} onSubmit={close}>
                <input type="hidden" name="message_id" value={messageId} />
                <input type="hidden" name="room_id" value={roomId} />
                <input type="hidden" name="emoji" value={emoji} />
                <button
                  type="submit"
                  aria-label={`${emoji}でリアクション`}
                  className="w-9 h-9 rounded-full text-[22px] leading-none transition-transform hover:scale-110 active:bg-white/15"
                >
                  {emoji}
                </button>
              </form>
            ))}
          </div>

          {/* 操作 */}
          <div className="grid grid-cols-4 gap-0.5 pt-2">
            <MenuButton
              icon="reply"
              label="リプライ"
              onClick={() => {
                setReply({ id: messageId, senderName, preview });
                close();
                focusComposer();
              }}
            />
            {text && <MenuButton icon="copy" label="コピー" onClick={() => void copy()} />}
            <form action={togglePinAction} onSubmit={close}>
              <input type="hidden" name="message_id" value={messageId} />
              <input type="hidden" name="room_id" value={roomId} />
              <input type="hidden" name="pinned" value={pinned ? "0" : "1"} />
              <MenuButton type="submit" icon="book" label={pinned ? "ノート解除" : "ノート保存"} />
            </form>
            {canAnnounce && (
              <form action={toggleAnnounceAction} onSubmit={close}>
                <input type="hidden" name="message_id" value={messageId} />
                <input type="hidden" name="room_id" value={roomId} />
                <input type="hidden" name="announced" value={announced ? "0" : "1"} />
                <MenuButton type="submit" icon="megaphone" label={announced ? "掲示をやめる" : "アナウンス"} />
              </form>
            )}
            {mine && (
              <form
                action={deleteMessageAction}
                onSubmit={(e) => {
                  if (!confirm("送信を取り消しますか？\nトークの全員の画面から消えます。")) {
                    e.preventDefault();
                    return;
                  }
                  close();
                }}
              >
                <input type="hidden" name="message_id" value={messageId} />
                <input type="hidden" name="room_id" value={roomId} />
                <MenuButton type="submit" icon="trash" label="送信取消" danger />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 写真の拡大表示など、吹き出しの中に出ていてもメニューの対象にしない要素か */
function isOutsideMenuTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-no-menu]") !== null;
}

function MenuButton({
  icon,
  label,
  onClick,
  type = "button",
  danger = false,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  danger?: boolean;
}) {
  return (
    <button
      type={type}
      role="menuitem"
      onClick={onClick}
      className={`w-full flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-[10px] font-bold leading-none active:bg-white/15 hover:bg-white/10 ${
        danger ? "text-[#ff8a80]" : "text-white"
      }`}
    >
      <Icon name={icon} className="w-5 h-5" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 入力欄
// ---------------------------------------------------------------------------

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

/** 入力欄が伸びる上限（px）。これを超えたら欄の中でスクロール */
const COMPOSER_MAX_HEIGHT = 140;

export function ChatComposer({
  roomId,
  members,
}: {
  roomId: string;
  /** メンション候補（自分以外のルームメンバー） */
  members: ComposerMember[];
}) {
  const { reply, setReply, registerComposer, scrollToBottom } = useChatRoom();
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    registerComposer(() => textareaRef.current?.focus());
  }, [registerComposer]);

  // 入力に合わせて高さを伸ばす（LINEのように改行すると欄が広がる）
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [body]);

  const canSend = Boolean(body.trim() || image || file) && !sending && !busy;

  const send = async () => {
    if (!canSend) return;
    const fd = new FormData();
    fd.set("room_id", roomId);
    fd.set("body", body.trim());
    fd.set("image", image);
    fd.set("file", file);
    fd.set("file_name", fileName);
    fd.set("reply_to", reply?.id ?? "");
    const draft = { body, image, file, fileName, reply };

    // 送ったらすぐ入力欄を空にして、最新の位置へ（失敗したら入力を戻す）
    setBody("");
    setImage("");
    setFile("");
    setFileName("");
    setReply(null);
    setError("");
    setMentionOpen(false);
    setSending(true);
    scrollToBottom();
    try {
      await sendMessageAction(fd);
    } catch {
      setBody(draft.body);
      setImage(draft.image);
      setFile(draft.file);
      setFileName(draft.fileName);
      setReply(draft.reply);
      setError("送信できませんでした。電波の良いところでもう一度送ってください");
    } finally {
      setSending(false);
    }
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
    setBody((prev) => `${prev}${prev.endsWith(" ") || prev.endsWith("\n") || prev === "" ? "" : " "}@${flat} `);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  const iconButton =
    "w-9 h-10 shrink-0 flex items-center justify-center rounded-full text-[#5f6368] active:bg-black/5 cursor-pointer";

  return (
    <div className="shrink-0 border-t border-black/10 bg-white px-1.5 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        {/* リプライ先 */}
        {reply && (
          <div className="mb-1.5 mx-1 flex items-center gap-2 rounded-xl bg-[#f2f3f5] px-3 py-1.5">
            <Icon name="reply" className="w-4 h-4 shrink-0 text-[#8a8f98]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-[#333]">{reply.senderName}へのリプライ</span>
              <span className="block truncate text-xs text-[#777]">{reply.preview}</span>
            </span>
            <button
              type="button"
              onClick={() => setReply(null)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#8a8f98] active:bg-black/5"
              aria-label="リプライをやめる"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 添付のプレビュー */}
        {image && (
          <div className="mb-1.5 mx-1 flex items-center gap-2">
            <img src={image} alt="添付する写真" className="h-16 rounded-lg border border-black/10" />
            <button type="button" onClick={() => setImage("")} className="text-xs font-bold text-red-500 underline">
              添付を取り消す
            </button>
          </div>
        )}
        {file && (
          <div className="mb-1.5 mx-1 flex items-center gap-2 rounded-xl bg-[#f2f3f5] px-3 py-1.5">
            <Icon name="fileText" className="w-4 h-4 shrink-0 text-[#e0463a]" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#333]">{fileName}</span>
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
        {error && <p className="mb-1.5 mx-1 text-[11px] font-bold text-red-500">{error}</p>}

        {/* メンション候補 */}
        {mentionOpen && members.length > 0 && (
          <div className="mb-1.5 mx-1 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-[#f2f3f5] p-2 scroll-slim">
            <button
              type="button"
              onClick={() => insertMention("all")}
              className="rounded-full bg-[var(--line-green)] px-3 py-1 text-xs font-bold text-white"
            >
              @全員
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => insertMention(m.name)}
                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#333] ring-1 ring-black/10"
              >
                @{m.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-0.5">
          {/* 写真 */}
          <label className={iconButton} aria-label="写真を送る" title="写真を送る">
            {busy ? <span className="text-[10px] font-bold">…</span> : <Icon name="image" className="w-6 h-6" />}
            <input type="file" accept="image/*" onChange={onPickImage} disabled={busy} className="hidden" />
          </label>
          {/* PDF */}
          <label className={iconButton} aria-label="PDFを送る" title="PDFを送る">
            <Icon name="fileText" className="w-6 h-6" />
            <input type="file" accept="application/pdf" onChange={onPickFile} disabled={busy} className="hidden" />
          </label>
          {/* メンション */}
          <button
            type="button"
            onClick={() => setMentionOpen((v) => !v)}
            aria-label="メンションする"
            title="メンションする"
            className={`${iconButton} text-lg font-bold ${mentionOpen ? "!text-[var(--line-green)]" : ""}`}
          >
            @
          </button>

          {/* Enterは改行（LINEと同じ）。送信は右の送信ボタン。PCは Ctrl/⌘＋Enter でも送れる */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            enterKeyHint="enter"
            placeholder="メッセージを入力"
            aria-label="メッセージ"
            className="mx-1 min-w-0 flex-1 resize-none rounded-[20px] bg-[#f2f3f5] px-3.5 py-2 text-base leading-[1.4] text-[#111] !outline-none placeholder:text-[#a0a4ab] focus:ring-1 focus:ring-black/10"
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
          />
          <button
            type="button"
            onClick={() => void send()}
            // 押してもキーボードを閉じない（続けて入力できるように）
            onMouseDown={(e) => e.preventDefault()}
            disabled={!canSend}
            aria-label="送信"
            className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-colors ${
              canSend ? "text-[var(--line-green)] active:bg-black/5" : "text-[#c4c7cc]"
            }`}
          >
            <Icon name="send" className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 見出しの「≡」メニュー
// ---------------------------------------------------------------------------

export function RoomMenu({
  roomId,
  current,
  counts,
}: {
  roomId: string;
  current: string;
  counts: { notes: number; media: number; members: number };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const items: { key: string; label: string; icon: IconName; count?: number }[] = [
    { key: "talk", label: "トーク", icon: "chat" },
    { key: "notes", label: "ノート", icon: "book", count: counts.notes },
    { key: "media", label: "写真・ファイル", icon: "image", count: counts.media },
    { key: "members", label: "メンバー", icon: "users", count: counts.members },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="トークのメニュー"
        className="w-10 h-10 flex items-center justify-center rounded-full text-[#111] active:bg-black/10"
      >
        <Icon name="menu" className="w-6 h-6" />
      </button>
      {open && (
        <div className="absolute right-1 top-full z-50 mt-1 w-56 rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-black/5">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.key === "talk" ? `/staff/chat/${roomId}` : `/staff/chat/${roomId}?tab=${item.key}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-bold hover:bg-black/5 ${
                current === item.key ? "text-[var(--line-green)]" : "text-[#222]"
              }`}
            >
              <Icon name={item.icon} className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {item.count ? <span className="text-xs font-bold text-[#999]">{item.count}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// トーク一覧・グループ作成で使う部品
// ---------------------------------------------------------------------------

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
      <Icon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-[#9aa0a6]"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="検索"
        className="w-full rounded-full bg-[#eef0f2] py-2.5 pl-10 pr-10 text-base text-[#111] !outline-none placeholder:text-[#9aa0a6] focus:ring-2 focus:ring-[#06c755]/40"
        aria-label="トークを探す（名前・本文）"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa0a6]"
          aria-label="検索をやめる"
        >
          <Icon name="close" className="w-4 h-4" />
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
export function Lightbox({
  src,
  alt,
  className,
  imgClassName = "w-full h-full object-cover",
}: {
  src: string;
  alt: string;
  className: string;
  imgClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={`${alt}を拡大`}>
        <img src={src} alt={alt} className={imgClassName} draggable={false} />
      </button>
      {open && (
        <div
          role="presentation"
          data-no-menu
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain rounded-lg" />
          <span className="absolute top-4 right-4 text-white text-2xl font-bold">✕</span>
        </div>
      )}
    </>
  );
}
