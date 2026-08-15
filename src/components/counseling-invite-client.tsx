"use client";

// 来店前カウンセリング案内のクライアント部品。
//  ・SmsSendButton …… 端末のSMSアプリを本文入りで開く（iOS/Androidで区切り文字が違うため端末判定）
//  ・CopyButton ……… 案内URLをクリップボードへコピー

import { useState } from "react";
import { Icon } from "@/components/icons";

/** SMSアプリを開くリンク（本文プリセット付き） */
export function SmsSendButton({ phone, body }: { phone: string; body: string }) {
  const open = () => {
    // iOSは "sms:番号&body="、Androidは "sms:番号?body="
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const sep = isIos ? "&" : "?";
    window.location.href = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
  };
  return (
    <button
      type="button"
      onClick={open}
      className="btn-primary w-full !min-h-12 inline-flex items-center justify-center gap-2"
    >
      <Icon name="send" className="w-4 h-4" />
      SMSアプリで送る（本文入り）
    </button>
  );
}

/** URLコピー */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード未対応でも選択できるようURL自体は表示している
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="btn-secondary w-full !min-h-12 inline-flex items-center justify-center gap-2"
    >
      <Icon name={copied ? "checkCircle" : "link"} className="w-4 h-4" />
      {copied ? "コピーしました" : "URLをコピー"}
    </button>
  );
}
