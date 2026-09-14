import { formatDateTimeJa } from "@/lib/date";
import type { EniReportComment } from "@/lib/data/types";

/**
 * 日報・週報についたコメントの表示（本人の入力画面用・読み取り専用）。
 * 先輩・幹部が何人でも書けるので、古い順に並べて全部出す。
 * legacyComment は、コメント欄が1枠しか無かった頃のデータ。
 */
export function ReportComments({
  comments,
  staffNames,
  legacyComment,
  legacyCommentedBy,
}: {
  comments: EniReportComment[];
  staffNames: Map<string, string>;
  legacyComment?: string;
  legacyCommentedBy?: string | null;
}) {
  if (!legacyComment && comments.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      <p className="text-xs font-bold text-brand-700">先輩・上司からのコメント</p>
      {legacyComment && (
        <div className="rounded-2xl bg-brand-50 border border-brand-200 p-4">
          <p className="text-[11px] font-bold text-brand-700">
            {legacyCommentedBy ? staffNames.get(legacyCommentedBy) ?? "" : ""}
          </p>
          <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">{legacyComment}</p>
        </div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="rounded-2xl bg-brand-50 border border-brand-200 p-4">
          <p className="text-[11px] font-bold text-brand-700">
            {staffNames.get(c.staffId) ?? "（不明）"}
            <span className="text-ink-400 font-normal ml-1.5">{formatDateTimeJa(c.createdAt, true)}</span>
          </p>
          <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
