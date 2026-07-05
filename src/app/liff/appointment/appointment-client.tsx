"use client";

/* eslint-disable @next/next/no-img-element */
// 予約確認・変更・キャンセル（顧客がスマホで操作する画面）
// リマインドLINEのリンクから開き、ご自身の次回予約を確認・変更希望・キャンセルできる。

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTimeJa, utcToJstLocal } from "@/lib/date";
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

interface ApiAppointment {
  id: string;
  scheduledAt: string; // ISO
  staffName: string;
  status: "scheduled" | "confirmed" | "change_requested" | "cancelled";
  requestedNewAt: string | null;
}

type Phase = "init" | "ready" | "fatal";

export function AppointmentClient({
  liffId,
  logoSrc = "/logo.svg",
}: {
  liffId: string;
  logoSrc?: string;
}) {
  const isMock = !liffId;
  const [phase, setPhase] = useState<Phase>(isMock ? "ready" : "init");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [mockUserId, setMockUserId] = useState("mock-user-1");
  const [changeTarget, setChangeTarget] = useState<string | null>(null); // 変更フォームを開いている予約ID
  const [busy, setBusy] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  const auth = useCallback(
    () => ({
      accessToken: accessTokenRef.current ?? undefined,
      mockUserId: isMock ? mockUserId : undefined,
    }),
    [isMock, mockUserId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/liff/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth()),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        fullName?: string;
        appointments?: ApiAppointment[];
      };
      if (data.ok) {
        setFullName(data.fullName ?? "");
        setAppointments(data.appointments ?? []);
      } else {
        setError(data.error ?? "読み込みに失敗しました");
      }
    } catch {
      setError("通信に失敗しました。電波の良い場所でもう一度お試しください");
    }
    setLoading(false);
  }, [auth]);

  // モックモード：初期表示で読み込み
  useEffect(() => {
    if (isMock) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMock]);

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
      setPhase("ready");
      await load();
    } catch (e) {
      console.error("LIFF初期化に失敗:", e);
      setPhase("fatal");
    }
  }, [liffId, load]);

  const act = async (
    id: string,
    action: "confirm" | "request_change" | "cancel",
    extra?: { newAt?: string; note?: string }
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/liff/appointments/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth(), id, action, ...extra }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        setMessage(data.message ?? "操作を受け付けました");
        setChangeTarget(null);
        await load();
        window.scrollTo(0, 0);
      } else {
        setError(data.error ?? "操作に失敗しました");
      }
    } catch {
      setError("通信に失敗しました。もう一度お試しください");
    }
    setBusy(false);
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
        <p className="text-xs font-bold tracking-[0.25em] text-brand-600 mt-1.5">ご予約の確認</p>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 pb-16 space-y-4">
        {isMock && (
          <div className="rounded-xl bg-amber-100 text-amber-800 text-xs font-bold p-3 space-y-2">
            <p>デモモード（LIFF未接続）：テスト用ユーザーIDで表示します</p>
            <input
              value={mockUserId}
              onChange={(e) => setMockUserId(e.target.value)}
              onBlur={() => void load()}
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
            読み込みに失敗しました。LINEのメッセージのリンクから開き直してください。
          </p>
        )}

        {message && (
          <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3">{error}</p>
        )}

        {phase === "ready" && (
          <>
            {fullName && <p className="text-sm font-bold text-stone-600">{fullName} 様のご予約</p>}

            {loading ? (
              <p className="card text-center text-sm font-bold text-stone-500 animate-pulse">
                読み込み中…
              </p>
            ) : appointments.length === 0 ? (
              <div className="card text-center py-10 space-y-2">
                <Icon name="calendar" className="w-10 h-10 mx-auto text-brand-300" />
                <p className="text-sm font-bold text-stone-500">現在、今後のご予約はありません</p>
                <p className="text-xs text-stone-400">
                  ご予約はお電話またはホットペッパービューティーから承っております
                </p>
              </div>
            ) : (
              appointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  busy={busy}
                  changeOpen={changeTarget === a.id}
                  onToggleChange={() => setChangeTarget(changeTarget === a.id ? null : a.id)}
                  onAct={act}
                />
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}

function statusView(status: ApiAppointment["status"]): { label: string; cls: string } {
  switch (status) {
    case "confirmed":
      return { label: "確認済み", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "change_requested":
      return { label: "変更希望を送信済み", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    case "cancelled":
      return { label: "キャンセル済み", cls: "bg-red-50 text-red-600 border-red-200" };
    default:
      return { label: "ご予約中", cls: "bg-brand-50 text-brand-700 border-brand-200" };
  }
}

function AppointmentCard({
  appointment: a,
  busy,
  changeOpen,
  onToggleChange,
  onAct,
}: {
  appointment: ApiAppointment;
  busy: boolean;
  changeOpen: boolean;
  onToggleChange: () => void;
  onAct: (
    id: string,
    action: "confirm" | "request_change" | "cancel",
    extra?: { newAt?: string; note?: string }
  ) => Promise<void>;
}) {
  const [newAt, setNewAt] = useState("");
  const [note, setNote] = useState("");
  const scheduled = new Date(a.scheduledAt);
  const badge = statusView(a.status);

  return (
    <div className="card space-y-3">
      <div>
        <p className="font-display text-xl font-bold">{formatDateTimeJa(scheduled, true)}</p>
        {a.staffName && <p className="text-sm text-stone-500 mt-0.5">担当：{a.staffName}</p>}
        <span
          className={`inline-block mt-2 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}
        >
          {badge.label}
        </span>
        {a.status === "change_requested" && a.requestedNewAt && (
          <p className="text-xs text-amber-700 font-bold mt-1">
            ご希望：{formatDateTimeJa(new Date(a.requestedNewAt), true)}（サロン確認中）
          </p>
        )}
      </div>

      {a.status !== "cancelled" && (
        <div className="space-y-2">
          {a.status === "scheduled" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAct(a.id, "confirm")}
              className="btn-primary w-full"
            >
              この予約で来店します（確認）
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onToggleChange}
            className="w-full rounded-2xl border-2 border-brand-300 px-4 py-3 font-bold text-brand-700"
          >
            日時の変更を希望する
          </button>

          {changeOpen && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 space-y-2">
              <label className="label" htmlFor={`newat-${a.id}`}>
                ご希望の日時
              </label>
              <input
                id={`newat-${a.id}`}
                type="datetime-local"
                value={newAt}
                min={utcToJstLocal(new Date())}
                onChange={(e) => setNewAt(e.target.value)}
                className="input"
              />
              <label className="label" htmlFor={`note-${a.id}`}>
                メモ（任意）
              </label>
              <textarea
                id={`note-${a.id}`}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例）午後なら何時でも大丈夫です"
                className="input min-h-16"
              />
              <button
                type="button"
                disabled={busy || !newAt}
                onClick={() => void onAct(a.id, "request_change", { newAt, note })}
                className="btn-primary w-full disabled:opacity-50"
              >
                この内容で変更を希望する
              </button>
              <p className="text-[11px] text-stone-500">
                ※空き状況をサロンで確認し、確定後にLINEでお知らせします
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("このご予約をキャンセルしますか？")) {
                void onAct(a.id, "cancel");
              }
            }}
            className="w-full rounded-2xl border-2 border-red-200 px-4 py-3 font-bold text-red-500 text-sm"
          >
            予約をキャンセルする
          </button>
        </div>
      )}
    </div>
  );
}
