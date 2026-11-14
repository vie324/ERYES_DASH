// ホーム（ENi）の部品：4つのリマインド数字・ショートカット・見える化のカード・全体スケジュールの直近。
// 見た目の値（色・余白・角丸）は globals.css の --ios-* だけで決める。

import Link from "next/link";
import { Icon } from "@/components/icons";
import { accentStyle } from "@/lib/menu-accent";
import { eventPeriodLabel } from "@/lib/company-events";
import type { ReminderTile } from "@/lib/home/reminders";
import type { ShortcutBadgeKey, ShortcutDef } from "@/lib/home/shortcuts";
import type { InsightCard, InsightTone } from "@/lib/home/insights";
import type { CompanyEvent } from "@/lib/data/types";

const TILE_TONE: Record<ReminderTile["tone"], string> = {
  good: "ios-tone-ok",
  warning: "ios-tone-warning",
  critical: "ios-tone-danger",
  accent: "",
};

const INSIGHT_TONE: Record<InsightTone, string> = {
  ok: "ios-tone-ok",
  warning: "ios-tone-warning",
  danger: "ios-tone-danger",
  muted: "ios-tone-muted",
};

/** 4つのリマインド数字（2列×2行） */
export function ReminderTiles({ tiles }: { tiles: ReminderTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--ios-gap)]">
      {tiles.map((t) => (
        <Link key={t.key} href={t.href} className="ios-card !p-3.5 block">
          <p className="text-[12px] font-semibold ios-secondary truncate">{t.label}</p>
          <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${TILE_TONE[t.tone]}`}>
            {t.value}
            <span className="ml-0.5 text-[13px] font-semibold ios-secondary">{t.unit}</span>
          </p>
          <p className="mt-1.5 text-[11px] ios-secondary truncate">{t.sub}</p>
        </Link>
      ))}
    </div>
  );
}

/** ショートカット（iPhoneのホーム画面のように1行4つ）。未読・未完了は小さな数字 */
export function ShortcutGrid({
  items,
  badges,
}: {
  items: ShortcutDef[];
  badges: Partial<Record<ShortcutBadgeKey, number | string | null>>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="ios-card !px-1.5 !py-4">
      <div className="grid grid-cols-4 gap-y-4">
        {items.map((s) => {
          const badge = s.badge ? badges[s.badge] : null;
          return (
            <Link key={s.key} href={s.href} className="flex flex-col items-center gap-1.5 active:opacity-70">
              <span className="ios-app-icon" style={accentStyle(s.accent)}>
                <Icon name={s.icon} className="w-7 h-7" />
                {badge ? (
                  <span className="ios-badge" aria-label={typeof badge === "number" ? `${badge}件` : "未提出あり"}>
                    {typeof badge === "number" && badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight px-0.5">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** 見える化の1枚（本人の分 → 集計 → 名前 の順。見せない部分は最初から入っていない） */
export function InsightCardView({ card }: { card: InsightCard }) {
  return (
    <section className="ios-card" aria-label={card.title}>
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-[15px] font-bold leading-snug">{card.title}</h3>
        {card.href && (
          <Link href={card.href} className="shrink-0 text-[12px] font-semibold text-[var(--ios-accent)]">
            くわしく
          </Link>
        )}
      </div>
      <p className="text-[11px] ios-secondary mt-0.5 leading-relaxed">{card.definition}</p>

      {card.self && (
        <p className={`mt-2.5 text-[13px] font-semibold ${INSIGHT_TONE[card.self.tone]}`}>
          {card.self.href ? (
            <Link href={card.self.href} className="inline-flex items-center gap-0.5">
              {card.self.text}
              <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </Link>
          ) : (
            card.self.text
          )}
        </p>
      )}

      {card.summary && card.summary.length > 0 && (
        <div className="mt-2.5 border-t border-[var(--ios-separator)]">
          {card.summary.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-1.5 text-[13px] border-b border-[var(--ios-separator)] last:border-b-0">
              <span className="ios-secondary truncate">{row.label}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${row.tone ? INSIGHT_TONE[row.tone] : ""}`}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {card.names &&
        card.names.map((group) => (
          <div key={group.group} className="mt-2.5">
            <p className="text-[12px] font-semibold ios-secondary">{group.group}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {group.people.map((p, i) => (
                <span key={`${p.name}-${i}`} className="ios-pill">
                  {p.name}
                  {p.note && <span className="ios-secondary font-normal">{p.note}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}

/** 全体スケジュールの直近の予定 */
export function UpcomingEvents({ events }: { events: CompanyEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="ios-card text-[13px] ios-secondary">これからの全体スケジュールはまだありません。</div>
    );
  }
  return (
    <div className="ios-list">
      {events.map((e) => (
        <Link key={e.id} href={`/staff/plan?tab=all&month=${e.startDate.slice(0, 7)}`} className="ios-row">
          <div className="w-11 shrink-0 text-center">
            <p className="text-[11px] font-semibold ios-secondary">{Number(e.startDate.slice(5, 7))}月</p>
            <p className="text-[22px] font-bold leading-none tabular-nums">{Number(e.startDate.slice(8, 10))}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold truncate">{e.title}</p>
            <p className="text-[12px] ios-secondary truncate">
              {eventPeriodLabel(e)}
              {e.required ? "・全員参加" : "・任意"}
            </p>
          </div>
          <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-[#c7c7cc]" />
        </Link>
      ))}
    </div>
  );
}
