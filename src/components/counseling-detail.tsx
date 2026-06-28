/* eslint-disable @next/next/no-img-element */
// カウンセリング回答の表示（スタッフ画面・管理者画面で共用）

import { COUNSELING_ITEMS, formatAnswer, visibleItems } from "@/lib/counseling/items";
import { formatDateTimeJa } from "@/lib/date";
import type { CounselingResponse, Customer } from "@/lib/data/types";
import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

/** 施術前に必ず確認すべき回答（アレルギーあり・妊娠中など）を抽出 */
export function riskFlags(answers: Record<string, unknown>): string[] {
  const flags: string[] = [];
  if (answers.allergy === "あり") flags.push("アレルギー・皮膚疾患あり");
  if (typeof answers.pregnant === "string" && answers.pregnant.startsWith("はい")) {
    flags.push("妊娠中・可能性・生理中の申告あり");
  }
  if (answers.consent_agreed !== true) flags.push("注意事項・同意書が未署名");
  return flags;
}

export function CounselingStatusBadge({ status }: { status: CounselingResponse["status"] }) {
  return status === "pending" ? (
    <StatusBadge label="未確認" tone="pending" />
  ) : (
    <StatusBadge label="確認済み" tone="ok" />
  );
}

export function CounselingDetail({
  response,
  customer,
  confirmedByName,
}: {
  response: CounselingResponse;
  customer: Customer | null;
  confirmedByName?: string | null;
}) {
  const flags = riskFlags(response.answers);

  // 選択メニューに応じた項目だけ表示（まつげ/眉で不要な項目は出さない）
  const shownItems = visibleItems(response.answers.menu);
  // 定義済み項目以外のキーが回答に含まれる場合も表示する（項目変更後の過去回答対策）
  const knownKeys = new Set(COUNSELING_ITEMS.map((i) => i.key));
  // 「その他」自由記入（${key}_other）と同意書（consent_*）は専用表示のため一覧からは除外
  const otherKeys = new Set(
    COUNSELING_ITEMS.filter((i) => i.options?.includes("その他")).map((i) => `${i.key}_other`)
  );
  const extraKeys = Object.keys(response.answers).filter(
    (k) => !knownKeys.has(k) && !otherKeys.has(k) && !k.startsWith("consent_")
  );

  const signature =
    typeof response.answers.consent_signature === "string" ? response.answers.consent_signature : "";
  const consentName = typeof response.answers.consent_name === "string" ? response.answers.consent_name : "";
  const consentAgreed = response.answers.consent_agreed === true;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-lg font-bold">{customer?.fullName ?? "（顧客情報なし）"} 様</p>
            <p className="text-xs text-stone-500 mt-0.5">
              送信：{formatDateTimeJa(response.submittedAt, true)}
            </p>
          </div>
          <CounselingStatusBadge status={response.status} />
        </div>
        {response.status === "confirmed" && response.confirmedAt && (
          <p className="text-xs text-stone-500 mt-2">
            確認：{formatDateTimeJa(response.confirmedAt, true)}
            {confirmedByName ? `（${confirmedByName}）` : ""}
          </p>
        )}
      </div>

      {flags.length > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-bold text-red-700 mb-1 flex items-center gap-1.5">
            <Icon name="alertTriangle" className="w-4 h-4" />
            施術前に必ず確認
          </p>
          <ul className="text-sm font-bold text-red-600 list-disc list-inside">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card divide-y divide-stone-100">
        {shownItems.map((item) => {
          const value = response.answers[item.key];
          let display = formatAnswer(item, value);
          // 「その他」選択時の自由記入を併記
          const otherText = response.answers[`${item.key}_other`];
          if (
            item.options?.includes("その他") &&
            Array.isArray(value) &&
            value.includes("その他") &&
            typeof otherText === "string" &&
            otherText
          ) {
            display += `（その他：${otherText}）`;
          }
          return (
            <div key={item.key} className="py-3 first:pt-0 last:pb-0">
              <p className="text-xs font-bold text-stone-500">{item.label}</p>
              <p className="text-base mt-0.5 whitespace-pre-wrap">{display}</p>
            </div>
          );
        })}
        {extraKeys.map((key) => (
          <div key={key} className="py-3">
            <p className="text-xs font-bold text-stone-500">{key}</p>
            <p className="text-base mt-0.5 whitespace-pre-wrap">{String(response.answers[key])}</p>
          </div>
        ))}
      </div>

      {(signature || consentName || consentAgreed) && (
        <div className="card space-y-2">
          <p className="text-xs font-bold text-stone-500">注意事項・同意書</p>
          <p className="text-sm">
            {consentAgreed ? "注意事項に同意のうえ署名済み" : "未同意"}
            {consentName ? `　／　お名前：${consentName}` : ""}
          </p>
          {signature && (
            <img
              src={signature}
              alt="お客様のご署名"
              className="w-full max-w-xs rounded-lg border border-stone-200 bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}
