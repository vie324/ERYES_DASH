"use client";

/* eslint-disable @next/next/no-img-element */
// カウンセリング入力フォーム（顧客がスマホで入力する画面）
// 項目定義は src/lib/counseling/items.ts にあり、コード修正だけで増減できる。
// 入力後は「注意事項・署名」ステップに進み、お名前と手書き署名をいただいてから送信する。

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { COUNSELING_ITEMS, MENU_KEY, visibleItems, type CounselingItem } from "@/lib/counseling/items";
import {
  CONSENT_AGREE_LABEL,
  CONSENT_NOTICE_INTRO,
  CONSENT_NOTICE_SECTIONS,
  CONSENT_NOTICE_TITLE,
} from "@/lib/counseling/notice";
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
type Step = "form" | "consent";

export function CounselingForm({
  liffId,
  logoSrc = "/logo.svg",
}: {
  liffId: string;
  logoSrc?: string;
}) {
  const isMock = !liffId;
  const [phase, setPhase] = useState<Phase>(isMock ? "ready" : "init");
  const [step, setStep] = useState<Step>("form");
  const [errors, setErrors] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [menus, setMenus] = useState<string[]>([]); // 選択中のメニュー（セクションの表示切替に使う）
  const [mockUserId, setMockUserId] = useState("mock-user-1");
  const [inLineApp, setInLineApp] = useState(false);
  // 同意書（注意事項への同意・お名前・手書き署名）
  const [signName, setSignName] = useState("");
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState("");
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

  // カウンセリング入力 → 注意事項・署名へ
  const goConsent = () => {
    if (!formRef.current) return;
    // ご希望メニューはチェックボックスのため標準バリデーションが効かない → 個別に確認
    if (menus.length === 0) {
      setErrors(["ご希望のメニューを選択してください"]);
      window.scrollTo(0, 0);
      return;
    }
    if (!formRef.current.reportValidity()) return; // 必須項目の未入力チェック（ブラウザ標準）
    setErrors([]);
    setSignName((prev) => prev || fullName);
    setStep("consent");
    window.scrollTo(0, 0);
  };

  const backToForm = () => {
    setErrors([]);
    setStep("form");
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== "consent" || phase === "submitting") return;

    // 同意書の検証
    const ve: string[] = [];
    if (!signName.trim()) ve.push("お名前をご記入ください");
    if (!agree) ve.push("注意事項へのご同意が必要です");
    if (!signature) ve.push("ご署名をお願いいたします");
    if (ve.length > 0) {
      setErrors(ve);
      window.scrollTo(0, 0);
      return;
    }

    setErrors([]);
    setPhase("submitting");

    const fd = new FormData(formRef.current!);
    const answers: Record<string, unknown> = {};
    for (const item of COUNSELING_ITEMS) {
      if (item.type === "checkbox") {
        answers[item.key] = fd.getAll(item.key).map(String);
        // 「その他」選択時の自由記入
        if (item.options?.includes("その他")) {
          answers[`${item.key}_other`] = String(fd.get(`${item.key}_other`) ?? "");
        }
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
          consent: { name: signName.trim(), signature, agreed: agree },
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
        <img src={logoSrc} alt="EREYS" className="h-10 w-auto mx-auto" />
        <p className="text-xs font-bold tracking-[0.25em] text-brand-600 mt-1.5">
          {step === "consent" ? "注意事項・ご署名" : "カウンセリングシート"}
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

            {/* ステップ1：カウンセリング入力 */}
            <div className={step === "form" ? "space-y-4" : "hidden"}>
              {groupBySection(visibleItems(menus)).map((group) => (
                <section key={group.section} className="space-y-4">
                  <h2 className="font-display text-base font-bold text-ink-900 flex items-center gap-2 pt-1">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
                    {group.section}
                  </h2>
                  {group.items.map((item) => (
                    <FormField
                      key={item.key}
                      item={item}
                      fullName={fullName}
                      onFullNameChange={setFullName}
                      menus={menus}
                      onToggleMenu={(opt) =>
                        setMenus((prev) =>
                          prev.includes(opt) ? prev.filter((m) => m !== opt) : [...prev, opt]
                        )
                      }
                    />
                  ))}
                </section>
              ))}

              <button type="button" onClick={goConsent} className="btn-primary w-full text-lg">
                次へ（注意事項の確認・ご署名）
              </button>
            </div>

            {/* ステップ2：注意事項・同意・署名 */}
            <div className={step === "consent" ? "space-y-4" : "hidden"}>
              <section className="card space-y-3">
                <h2 className="font-display text-base font-bold text-ink-900">{CONSENT_NOTICE_TITLE}</h2>
                <p className="text-xs text-stone-500">{CONSENT_NOTICE_INTRO}</p>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-3">
                  {CONSENT_NOTICE_SECTIONS.map((sec) => (
                    <div key={sec.heading}>
                      <p className="text-xs font-bold text-brand-700">{sec.heading}</p>
                      <ul className="mt-1 space-y-1 text-xs text-ink-700 list-disc list-inside">
                        {sec.items.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <div className="card space-y-4">
                <label className="flex items-start gap-3 text-sm font-bold text-stone-700">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-0.5 h-6 w-6 accent-brand-500 shrink-0"
                  />
                  <span>{CONSENT_AGREE_LABEL}</span>
                </label>

                <div>
                  <p className="label !mb-2">
                    お名前（フルネーム）
                    <span className="text-red-500 text-xs font-bold ml-1">必須</span>
                  </p>
                  <input
                    type="text"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    placeholder="例）山田 花子"
                    className="input"
                  />
                </div>

                <div>
                  <p className="label !mb-2">
                    ご署名（指でなぞってご記入ください）
                    <span className="text-red-500 text-xs font-bold ml-1">必須</span>
                  </p>
                  <SignaturePad onChange={setSignature} />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={backToForm}
                  className="rounded-2xl border-2 border-stone-300 px-5 font-bold text-stone-600"
                >
                  戻る
                </button>
                <button type="submit" disabled={phase === "submitting"} className="btn-primary flex-1 text-lg">
                  {phase === "submitting" ? "送信中…" : "同意して送信する"}
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

/** 手書き署名パッド（指・スタイラスで描画 → PNGのデータURLを onChange で返す） */
function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const coords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    drawing.current = true;
    const { x, y } = coords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = coords(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1917";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasDrawn.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-44 rounded-xl border-2 border-dashed border-brand-300 bg-white touch-none"
      />
      <button type="button" onClick={clear} className="mt-2 text-xs font-bold text-stone-500 underline">
        署名をやり直す
      </button>
    </div>
  );
}

/** 表示順を保ったままセクションごとにまとめる */
function groupBySection(items: CounselingItem[]): { section: string; items: CounselingItem[] }[] {
  const groups: { section: string; items: CounselingItem[] }[] = [];
  for (const item of items) {
    let g = groups.find((x) => x.section === item.section);
    if (!g) {
      g = { section: item.section, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

function FormField({
  item,
  fullName,
  onFullNameChange,
  menus,
  onToggleMenu,
}: {
  item: CounselingItem;
  fullName: string;
  onFullNameChange: (v: string) => void;
  menus: string[];
  onToggleMenu: (opt: string) => void;
}) {
  // 「その他」を選んだときに自由記入欄を出すための状態
  const [showOther, setShowOther] = useState(false);
  const hasOther = item.type === "checkbox" && item.key !== MENU_KEY && (item.options?.includes("その他") ?? false);

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
          {item.options?.map((opt) => {
            // 「ご希望メニュー」は表示切替に使うため制御コンポーネントにする
            const isMenu = item.key === MENU_KEY;
            const isOther = opt === "その他";
            return (
              <label
                key={opt}
                className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-base has-checked:border-brand-400 has-checked:bg-brand-50"
              >
                <input
                  type="checkbox"
                  name={item.key}
                  value={opt}
                  {...(isMenu
                    ? { checked: menus.includes(opt), onChange: () => onToggleMenu(opt) }
                    : isOther
                      ? { onChange: (e: React.ChangeEvent<HTMLInputElement>) => setShowOther(e.target.checked) }
                      : {})}
                  className="h-5 w-5 accent-brand-500 shrink-0"
                />
                {opt}
              </label>
            );
          })}
          {hasOther && showOther && (
            <input
              type="text"
              name={`${item.key}_other`}
              placeholder="「その他」の内容をご記入ください"
              className="input"
            />
          )}
        </div>
      )}

      {item.type === "textarea" && (
        <textarea
          name={item.key}
          rows={3}
          required={item.required}
          placeholder={item.placeholder}
          defaultValue={item.defaultValue}
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
            defaultValue={item.defaultValue}
            className="input"
          />
        ))}

      {item.note && <p className="text-xs text-stone-400 mt-2">{item.note}</p>}
    </div>
  );
}
