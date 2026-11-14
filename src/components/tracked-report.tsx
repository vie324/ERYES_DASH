"use client";

// 「みんなの週報」の1件。タップして開いたら「見た」として記録する（週報の閲覧状況）。
// 中身はサーバーで描いたものをそのまま入れる（ここは開く・閉じると記録だけ）。

import { useRef } from "react";
import { Icon } from "@/components/icons";
import { recordReportViewAction } from "@/app/staff/eni-reports/actions";

export function TrackedReport({
  reportId,
  track,
  summary,
  children,
}: {
  reportId: string;
  /** 記録するか（自分の週報は記録しない） */
  track: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const sent = useRef(false);
  return (
    <details
      className="card group !p-0 overflow-hidden"
      onToggle={(e) => {
        if (!track || sent.current || !e.currentTarget.open) return;
        sent.current = true;
        recordReportViewAction(reportId).catch(() => {
          sent.current = false; // 送れなかったら、次に開いたときにもう一度
        });
      }}
    >
      <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-3.5">
        <span className="flex-1 min-w-0">{summary}</span>
        <Icon name="chevronDown" className="w-4 h-4 shrink-0 text-brand-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-ink-100">{children}</div>
    </details>
  );
}
