"use client";

// 押す前に確認する送信ボタン（公開・作り直し・削除など、やり直しのきかない操作用）。
// フォーム自体はサーバーアクションのまま。送信中は二重に押せないようにする。

import { useFormStatus } from "react-dom";

export function ConfirmSubmit({
  message,
  className,
  pendingLabel = "処理しています…",
  children,
}: {
  /** 確認のダイアログに出す文（空なら確認しない） */
  message?: string;
  className?: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (message && !window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
