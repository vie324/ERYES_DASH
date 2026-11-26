"use client";

// 依頼14：予定の確認の画面。新しい予定・変更があるときに、ほかの画面の上にかぶせて出す。
// 「確認しました」を押すまで閉じられない（確認するだけなので、数秒で終わる）。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ackGateAction } from "@/app/staff/confirmations/actions";

export interface GateItemView {
  itemType: string;
  itemId: string;
  version: string;
  title: string;
  detail: string;
}

export function ConfirmGate({ items }: { items: GateItemView[] }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (items.length === 0 || done) return null;
  const ack = () =>
    start(async () => {
      const r = await ackGateAction(items.map(({ itemType, itemId, version }) => ({ itemType, itemId, version })));
      if (r.ok) {
        setDone(true);
        router.refresh();
      }
    });
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="ios-sheet bg-white w-full sm:max-w-md p-5 max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <p id="gate-title" className="text-lg font-bold text-ink-900">予定の確認</p>
        <p className="text-sm text-ink-600 mt-1">新しい予定・変更があります。内容を見て「確認しました」を押してください。</p>
        <ul className="mt-4 space-y-2">
          {items.map((i) => (
            <li key={`${i.itemType}:${i.itemId}`} className="rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5">
              <p className="text-sm font-bold text-ink-900">{i.title}</p>
              <p className="text-xs text-ink-600 mt-0.5">{i.detail}</p>
            </li>
          ))}
        </ul>
        <button type="button" onClick={ack} disabled={pending} className="btn-primary w-full mt-5">
          {pending ? "記録しています…" : "確認しました"}
        </button>
      </div>
    </div>
  );
}
