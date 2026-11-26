"use client";

// はじめて開いたときの案内（3〜4枚のカード）。この端末で一度見たら出さない（右上の「？」でいつでも開き直せる）。

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GuideCard } from "@/lib/guides";
import { BodyPortal } from "@/components/body-portal";

export function FirstGuideSheet({ guideKey, cards, helpHref }: { guideKey: string; cards: GuideCard[]; helpHref?: string }) {
  const storageKey = `first-guide:${guideKey}:v1`;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      // 保存できない端末では出さない（毎回出ると邪魔なため）
    }
  }, [storageKey]);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "seen");
    } catch {
      // 保存できなくても閉じる
    }
  };
  if (cards.length === 0) return null;
  return (
    <>
      <button type="button" onClick={() => { setI(0); setOpen(true); }} className="btn-ghost !text-xs mb-2" aria-label="この画面の使い方を見る">
        ？ 使い方
      </button>
      {open && (
        <BodyPortal>
          <div className="fixed inset-0 z-[90] bg-black/40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="はじめての案内">
            <div className="ios-sheet bg-white w-full sm:max-w-md p-5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <p className="text-[11px] font-bold text-ink-400">
                {i + 1} / {cards.length}
              </p>
              <p className="text-lg font-bold text-ink-900 mt-1">{cards[i].title}</p>
              <p className="text-sm text-ink-700 leading-relaxed mt-2 min-h-20">{cards[i].body}</p>
              <div className="flex gap-1.5 justify-center my-4" aria-hidden="true">
                {cards.map((_, j) => (
                  <span key={j} className={`w-2 h-2 rounded-full ${j === i ? "bg-brand-600" : "bg-ink-200"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                {i > 0 && (
                  <button type="button" onClick={() => setI(i - 1)} className="btn-secondary flex-1">
                    もどる
                  </button>
                )}
                {i < cards.length - 1 ? (
                  <button type="button" onClick={() => setI(i + 1)} className="btn-primary flex-1">
                    次へ
                  </button>
                ) : (
                  <button type="button" onClick={close} className="btn-primary flex-1">
                    はじめる
                  </button>
                )}
              </div>
              <div className="flex justify-between mt-3 text-xs">
                <button type="button" onClick={close} className="text-ink-500 underline">
                  閉じる
                </button>
                {helpHref && (
                  <Link href={helpHref} onClick={close} className="font-bold text-brand-700 underline">
                    くわしい使い方
                  </Link>
                )}
              </div>
            </div>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
