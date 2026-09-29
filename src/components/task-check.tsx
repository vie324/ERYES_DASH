"use client";

// タスクのチェックボタン（送信ボタン部分だけのクライアント部品）。
// フォーム自体はサーバーアクションのまま（JSが読み込まれる前でも動く）で、
// 送信中は完了／未完了を先に切り替えて見せる。アクション側はリダイレクトしないので、
// 画面が先頭に戻ったり、開いていたカードが閉じたりせずに続けてチェックできる。

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";

export function TaskCheckSubmit({
  done,
  label,
  shape = "round",
}: {
  /** いま保存されている状態（送信中はこの逆を表示する） */
  done: boolean;
  /** 読み上げ用（例：「〇〇を完了にする」） */
  label: string;
  /** round＝タスク画面の丸／square＝議事録のタスク一覧の四角 */
  shape?: "round" | "square";
}) {
  const { pending } = useFormStatus();
  const shown = pending ? !done : done;

  if (shape === "square") {
    return (
      // 見た目は小さい四角のまま、押せる範囲だけ広げて連続で押しやすくする
      <button
        type="submit"
        aria-label={label}
        aria-busy={pending}
        className="-m-1.5 p-1.5 rounded-lg active:bg-amber-100/70"
      >
        <span
          className={`block w-5 h-5 rounded border-2 text-xs font-bold leading-4 text-center transition-colors ${
            shown ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-ink-300 text-transparent"
          }`}
        >
          ✓
        </span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      aria-label={label}
      aria-busy={pending}
      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
        shown
          ? "bg-emerald-500 border-emerald-500 text-white"
          : "bg-white border-ink-300 text-transparent hover:border-brand-400"
      }`}
    >
      <Icon name="checkCircle" className="w-4 h-4" />
    </button>
  );
}
