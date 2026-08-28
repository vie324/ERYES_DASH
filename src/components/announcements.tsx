"use client";

// ダッシュボード最上部の「全体共有」。
// トークルームの全体共有でアナウンスにした投稿だけが、ここに大きく出る。
// 複数あるときは数秒ごとに切り替わり、点（インジケータ）で手動でも送れる。

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export interface AnnouncementItem {
  id: string;
  body: string;
  senderName: string;
  when: string;
  roomId: string;
}

export function Announcements({ items }: { items: AnnouncementItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(timer);
  }, [items.length, paused]);

  if (items.length === 0) return null;
  const current = items[Math.min(index, items.length - 1)];

  return (
    <section
      className="announce mb-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="全体共有のお知らせ"
    >
      <div className="announce-inner">
        <div className="flex items-start gap-3">
          <span className="announce-badge shrink-0">
            <Icon name="megaphone" className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.14em] text-white/80 uppercase">
              全体共有
              {items.length > 1 && (
                <span className="ml-2 normal-case tracking-normal">
                  {index + 1}/{items.length}
                </span>
              )}
            </p>
            {/* 切り替えのたびにふわっと出す（key を変えてアニメーションを流し直す） */}
            <p
              key={current.id}
              className="announce-body font-display text-lg sm:text-xl font-bold text-white leading-snug mt-0.5 whitespace-pre-wrap break-words"
            >
              {current.body}
            </p>
            <p className="text-[11px] text-white/70 mt-1.5">
              {current.senderName}／{current.when}
              <Link
                href={`/staff/chat/${current.roomId}`}
                className="ml-2 font-bold text-white underline underline-offset-2"
              >
                全体共有を開く
              </Link>
            </p>
          </div>
        </div>

        {items.length > 1 && (
          <div className="flex items-center gap-1.5 mt-3 justify-center">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}件目のお知らせ`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
