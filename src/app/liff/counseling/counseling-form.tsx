"use client";

/* eslint-disable @next/next/no-img-element */
// カウンセリング入力フォーム（顧客がスマホで入力する画面）
// 項目定義は src/lib/counseling/items.ts にあり、コード修正だけで増減できる。

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { COUNSELING_ITEMS, type CounselingItem } from "@/lib/counseling/items";
import { Icon } from "@/components/icons";

// LIFF SDK（CDN読み込み）の最小型定義
interface LiffSdk {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(): void;
  getAccessToken(): string | null;
  closeWindow(): void;
  isInClient(): boolean;
}
declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

type Phase = "init" | "ready" | "submitting" | "done" | "fatal";

export function CounselingForm({
  liffId,
  logoSrc = "/logo.svg",
}: {
  liffId: string;
  logoSrc?: string;
}) {
  const isMock = !liffId;
  const [phase, setPhase] = useState<Phase>(isMock ? "ready" : "init");
  const [errors, setErrors] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [mockUserId, setMockUserId] = useState("mock-user-1");
  const [inLineApp, setInLineApp] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // 氏名の自動入力（LINE登録済みのお名前を取得）
  const loadProfile = useCallback(async (auth: { accessToken?: string; mockUserId?: string }) => {
    try {
      const res = await fetch("/api/liff/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth),
      });
      const data = (await res.json()) as { ok: boolean; fullName?: string };
      if (data.ok && data.fullName) setFullName(data.fullName);
    } catch {
      // 自動入力に失敗しても手入力できるため続行
    }
  }, []);

  // モックモード：初期表示でテスト用IDのプロフィールを読み込む
  useEffect(() => {
    if (isMock) void loadProfile({ mockUserId: "mock-user-1" });
  }, [isMock, loadProfile]);

  // 本番モード：LIFF SDK読み込み後に初期化
  const initLiff = useCallback(async () => {
    const liff = window.liff;
    if (!liff) return;
    try {
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      accessTokenRef.current = liff.getAccessToken();
      setInLineApp(liff.isInClient());
      await loadProfile({ accessToken: accessTokenRef.current ?? undefined });
      setPhase("ready");
    } catch (e) {
      console.error("LIFF初期化に失敗:", e);
      setPhase("fatal");
    }
  }, [liffId, loadProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current || phase === "submitting") return;
    setErrors([]);
    setPhase("submitting");

    const fd = new FormData(formRef.current);
    const answers: Record<string, unknown> = {};
    for (const item of COUNSELING_ITEMS) {
      if (item.type === "checkbox") {
        answers[item.key] = fd.getAll(item.key).map(String);
      } else if (item.type === "agree") {
        answers[item.key] = fd.get(item.key) === "on";
      } else {
        answers[item.key] = String(fd.get(item.key) ?? "");
      }
    }

    try {
      const res = await fetch("/api/liff/counseling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessTokenRef.current ?? undefined,
          mockUserId: isMock ? mockUserId : undefined,
          answers,
        }),
      });
      const data = (await res.json()) as { ok: boolean; errors?: string[] };
      if (data.ok) {
        setPhase("done");
        window.scrollTo(0, 0);
      } else {
        setErrors(data.errors ?? ["送信に失敗しました。もう一度お試しください"]);
        setPhase("ready");
      }
    } catch {
      setErrors(["通信に失敗しました。電波の良い場所でもう一度お試しください"]);
      setPhase("ready");
    }
  };

  return (
    <div className="min-h-dvh bg-brand-50">
      {!isMock && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={() => void initLiff()}
        />
      )}

      <header className="bg-white/90 backdrop-blur border-b border-brand-200 py-5 text-center">
        <img src={logoSrc} alt="EREYS" className="h-8 w-auto mx-auto" />
        <p className="text-xs font-bold tracking-[0.25em] text-brand-600 mt-1.5">
          ご来店前カウンセリング
        </p>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 pb-16">
        {isMock && phase !== "done" && (
          <div className="rounded-xl bg-amber-100 text-amber-800 text-xs font-bold p-3 mb-4 space-y-2">
            <p>デモモード（LIFF未接続）：テスト用ユーザーIDで送信されます</p>
            <input
              value={mockUserId}
              onChange={(e) => setMockUserId(e.target.value)}
              onBlur={() => void loadProfile({ mockUserId })}
              className="input !min-h-10 !py-2 text-sm"
              aria-label="テスト用ユーザーID"
            />
          </div>
        )}

        {phase === "init" && (
          <p className="card text-center text-sm font-bold text-stone-500 animate-pulse">
            LINEと接続しています…
          </p>
        )}

        {phase === "fatal" && (
          <p className="card text-center text-sm font-bold text-red-600">
            読み込みに失敗しました。LINEアプリのメニューから開き直してください。
          </p>
        )}

        {phase === "done" && (
          <div className="card text-center py-10 space-y-3 animate-fade-up">
            <Icon name="checkCircle" className="w-12 h-12 mx-auto text-brand-500" />
            <p className="font-display text-xl font-bold">送信ありがとうございました</p>
            <p className="text-sm text-stone-500">
              スタッフが内容を確認のうえ、ご来店時にお伺いします。
              <br />
              当日お会いできるのを楽しみにしております。
            </p>
            {inLineApp && (
              <button type="button" onClick={() => window.liff?.closeWindow()} className="btn-primary w-full mt-2">
                閉じる
              </button>
            )}
          </div>
        )}

        {(phase === "ready" || phase === "submitting") && (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            {errors.length > 0 && (
              <div className="rounded-xl bg-red-50 text-red-600 text-sm font-bold p-4 space-y-1">
                {errors.map((e) => (
                  <p key={e}>・{e}</p>
                ))}
              </div>
            )}

            {COUNSELING_ITEMS.map((item) => (
              <FormField
                key={item.key}
                item={item}
                fullName={fullName}
                onFullNameChange={setFullName}
              />
            ))}

            <button type="submit" disabled={phase === "submitting"} className="btn-primary w-full text-lg">
              {phase === "submitting" ? "送信中…" : "この内容で送信する"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function FormField({
  item,
  fullName,
  onFullNameChange,
}: {
  item: CounselingItem;
  fullName: string;
  onFullNameChange: (v: string) => void;
}) {
  const requiredMark = item.required && (
    <span className="text-red-500 text-xs font-bold ml-1">必須</span>
  );

  if (item.type === "agree") {
    return (
      <div className="card !bg-brand-50 border-brand-200">
        <label className="flex items-start gap-3 text-sm font-bold text-stone-700">
          <input
            type="checkbox"
            name={item.key}
            required={item.required}
            className="mt-0.5 h-6 w-6 accent-brand-500 shrink-0"
          />
          <span>
            {item.note ?? item.label}
            {requiredMark}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="label !mb-2">
        {item.label}
        {requiredMark}
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
                className="h-5 w-5 accent-brand-500 shrink-0"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {item.type === "checkbox" && (
        <div className="space-y-2">
          {item.options?.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-base has-checked:border-brand-400 has-checked:bg-brand-50"
            >
              <input
                type="checkbox"
                name={item.key}
                value={opt}
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
          placeholder={item.placeholder}
          className="input min-h-24"
        />
      )}

      {(item.type === "text" || item.type === "tel" || item.type === "date") &&
        (item.key === "full_name" ? (
          <input
            type="text"
            name={item.key}
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            required={item.required}
            placeholder={item.placeholder}
            className="input"
          />
        ) : (
          <input
            type={item.type}
            name={item.key}
            required={item.required}
            placeholder={item.placeholder}
            className="input"
          />
        ))}

      {item.note && <p className="text-xs text-stone-400 mt-2">{item.note}</p>}
    </div>
  );
}
