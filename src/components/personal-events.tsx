// 依頼23：自分だけの予定（面接など）を、スケジュールの画面のその日の上に出す。

import Link from "next/link";
import type { PersonalEvent } from "@/lib/data/tables";

export function PersonalEventsBanner({ events }: { events: PersonalEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1.5" aria-label="自分の予定">
      {events.map((e) => {
        const body = (
          <>
            <span aria-hidden="true">📌</span>
            <span className="tabular-nums text-xs font-bold shrink-0">
              {e.startTime}〜{e.endTime}
            </span>
            <span className="flex-1 min-w-0 truncate font-bold">{e.title}</span>
          </>
        );
        const cls = "flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900";
        return (
          <li key={e.id}>
            {e.sourceType === "interview" ? (
              <Link href="/staff/recruit" className={cls}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
