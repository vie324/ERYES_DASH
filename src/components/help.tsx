// ヘルプページ用の表示部品（スタッフ用・管理者用で共用）

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/** 毎日の流れなどを縦タイムラインで見せる */
export function HelpTimeline({
  steps,
}: {
  steps: { time: string; title: string; body: string; href?: string }[];
}) {
  return (
    <ol className="relative border-s-2 border-brand-200 ml-3 space-y-5">
      {steps.map((s, i) => (
        <li key={i} className="ms-5">
          <span className="absolute -start-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 ring-4 ring-brand-50" />
          <span className="inline-block text-[11px] font-bold text-brand-600 bg-brand-100 rounded-full px-2 py-0.5 mb-1">
            {s.time}
          </span>
          <p className="font-bold text-ink-900">
            {s.href ? (
              <Link href={s.href} className="underline decoration-brand-300 hover:text-brand-700">
                {s.title}
              </Link>
            ) : (
              s.title
            )}
          </p>
          <p className="text-sm text-ink-500 mt-0.5 whitespace-pre-wrap">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** 各機能の使い方（折りたたみ式・アイコン付き） */
export function HelpAccordion({
  icon,
  title,
  summary,
  href,
  steps,
  notes,
  defaultOpen = false,
}: {
  icon: IconName;
  title: string;
  summary: string;
  href?: string;
  steps: string[];
  notes?: string[];
  defaultOpen?: boolean;
}) {
  return (
    <details className="card group" open={defaultOpen}>
      <summary className="flex items-center gap-3 cursor-pointer list-none">
        <span className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0 bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 text-brand-600">
          <Icon name={icon} className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold">{title}</span>
          <span className="block text-xs text-ink-500 mt-0.5">{summary}</span>
        </span>
        <Icon
          name="chevronDown"
          className="w-4 h-4 text-brand-400 shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="mt-4 pt-4 border-t border-brand-100 space-y-3">
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-ink-700 whitespace-pre-wrap">{step}</span>
            </li>
          ))}
        </ol>

        {notes && notes.length > 0 && (
          <ul className="rounded-xl bg-brand-50 border border-brand-100 p-3 space-y-1">
            {notes.map((n, i) => (
              <li key={i} className="text-xs text-ink-500 flex gap-1.5">
                <span className="text-brand-500 font-bold shrink-0">※</span>
                <span className="whitespace-pre-wrap">{n}</span>
              </li>
            ))}
          </ul>
        )}

        {href && (
          <Link href={href} className="btn-secondary w-full !py-2.5 !text-sm">
            この画面を開く
          </Link>
        )}
      </div>
    </details>
  );
}

/** よくある質問 */
export function HelpFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <details key={i} className="card group !py-3">
          <summary className="flex items-center gap-2 cursor-pointer list-none">
            <span className="font-bold text-brand-600 shrink-0">Q.</span>
            <span className="flex-1 font-bold text-sm text-ink-700">{item.q}</span>
            <Icon
              name="chevronDown"
              className="w-4 h-4 text-brand-400 shrink-0 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <p className="mt-2.5 pt-2.5 border-t border-brand-100 text-sm text-ink-600 whitespace-pre-wrap pl-6">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}

/** セクション見出し */
export function HelpHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-lg font-bold text-ink-900 mt-7 mb-3 flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
      {children}
    </h2>
  );
}
