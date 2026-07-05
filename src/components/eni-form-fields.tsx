// ENiの日報・週報フォームの入力欄（項目定義 src/lib/eni/forms.ts から自動生成）

import type { EniFormItem } from "@/lib/eni/forms";
import { formatEniAnswer } from "@/lib/eni/forms";

export function EniFormFields({
  items,
  answers,
}: {
  items: EniFormItem[];
  answers: Record<string, unknown>;
}) {
  const numberItems = items.filter((i) => i.type === "number");
  const otherItems = items.filter((i) => i.type !== "number");

  return (
    <>
      {numberItems.length > 0 && (
        <div className="card">
          <p className="font-bold text-sm text-stone-500 mb-3">数字の報告</p>
          <div className="grid grid-cols-2 gap-3">
            {numberItems.map((item) => (
              <div key={item.key}>
                <label className="label" htmlFor={item.key}>
                  {item.label}
                </label>
                <div className="relative">
                  <input
                    id={item.key}
                    name={item.key}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    defaultValue={
                      answers[item.key] === undefined || answers[item.key] === 0
                        ? ""
                        : Number(answers[item.key])
                    }
                    placeholder="0"
                    className="input pr-10 text-right text-lg font-bold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-400 font-bold">
                    {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherItems.map((item) => (
        <div key={item.key} className="card">
          <p className="label !mb-2">
            {item.label}
            {item.required && <span className="text-red-500 text-xs font-bold ml-1">必須</span>}
          </p>
          {item.type === "radio" && (
            <div className="space-y-2">
              {item.options?.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-base has-checked:border-brand-400 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name={item.key}
                    value={opt}
                    required={item.required}
                    defaultChecked={answers[item.key] === opt}
                    className="h-5 w-5 accent-brand-500 shrink-0"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {item.type === "textarea" && (
            <textarea
              name={item.key}
              rows={3}
              required={item.required}
              defaultValue={typeof answers[item.key] === "string" ? String(answers[item.key]) : ""}
              placeholder={item.placeholder}
              className="input min-h-24"
            />
          )}
          {item.type === "text" && (
            <input
              type="text"
              name={item.key}
              required={item.required}
              defaultValue={typeof answers[item.key] === "string" ? String(answers[item.key]) : ""}
              placeholder={item.placeholder}
              className="input"
            />
          )}
          {item.note && <p className="text-xs text-stone-400 mt-2">{item.note}</p>}
        </div>
      ))}
    </>
  );
}

/** 保存済みレポートの読み取り表示（幹部の閲覧画面用） */
export function EniAnswersView({
  items,
  answers,
}: {
  items: EniFormItem[];
  answers: Record<string, unknown>;
}) {
  const numberItems = items.filter((i) => i.type === "number");
  const otherItems = items.filter((i) => i.type !== "number");
  return (
    <div className="space-y-2">
      {numberItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {numberItems.map((item) => (
            <span key={item.key}>
              <span className="text-xs text-stone-500">{item.label}</span>{" "}
              <span className="font-bold">{formatEniAnswer(item, answers[item.key])}</span>
            </span>
          ))}
        </div>
      )}
      <dl className="space-y-2 text-sm">
        {otherItems.map((item) => {
          const v = answers[item.key];
          if (v === undefined || v === null || v === "") return null;
          return (
            <div key={item.key}>
              <dt className="text-xs font-bold text-brand-700">{item.label}</dt>
              <dd className="whitespace-pre-wrap text-ink-700">{String(v)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
