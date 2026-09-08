"use client";

// AIしもんのチャット画面。
//  ・送信すると /api/ai-shimon/chat から返答がストリーミングで届き、1文字ずつ表示する
//  ・履歴は端末の localStorage にだけ保存（人ごとにキーを分ける）。「新しく相談する」で消せる
//  ・知識ファイルの本文や出典は一切クライアントに来ない（返答の文字だけ）

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** サーバーへ送る会話の上限（古いものから落とす。サーバー側の上限と揃える） */
const MAX_TURNS = 30;

const EXAMPLES = [
  "後輩が同じミスを繰り返してて、どう言えばいいか分からない",
  "店販の提案が押し売りっぽくなっちゃう",
  "自分がこの先どうなりたいのか分からなくなってきた",
  "今日はもう疲れました",
];

export function AiShimonChat({
  staffId,
  ready,
  isAdmin,
}: {
  staffId: string;
  /** APIキー・プロンプトが揃っていて使える状態か */
  ready: boolean;
  isAdmin: boolean;
}) {
  const storageKey = `ai-shimon:${staffId}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 端末に残した履歴を読む（初回だけ）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTurns(
            parsed.filter(
              (t): t is Turn =>
                t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
            )
          );
        }
      }
    } catch {
      // 読めなければ空から始める
    }
    setLoaded(true);
  }, [storageKey]);

  // 履歴を端末に保存
  useEffect(() => {
    if (!loaded) return;
    try {
      if (turns.length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(turns.slice(-MAX_TURNS * 2)));
    } catch {
      // 容量超過などは無視（表示には影響しない）
    }
  }, [turns, loaded, storageKey]);

  // 新しい文字が届くたびに一番下へ
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    setError("");
    setInput("");
    const next: Turn[] = [...turns, { role: "user", content }];
    // 返答用の空の吹き出しを先に置き、届いた文字を足していく
    setTurns([...next, { role: "assistant", content: "" }]);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let received = "";
    try {
      const res = await fetch("/api/ai-shimon/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-MAX_TURNS) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = "うまく送れなかった。もう一回いける？";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // JSONでなければ既定の文言
        }
        throw new Error(message);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;
          let ev: { t?: string; error?: string };
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev.error) setError(ev.error);
          if (ev.t) {
            received += ev.t;
            const snapshot = received;
            setTurns([...next, { role: "assistant", content: snapshot }]);
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "通信に失敗しました");
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      // 1文字も届かなかったら空の吹き出しは消す（相談文は残す）
      if (!received) setTurns(next);
    }
  };

  const stop = () => abortRef.current?.abort();

  const reset = () => {
    if (turns.length > 0 && !confirm("いまの会話を消して、新しく相談を始めますか？")) return;
    stop();
    setTurns([]);
    setError("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // PCでは Ctrl/⌘+Enter で送信（スマホは改行のまま。送信はボタン）
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="space-y-3">
      {!ready && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <p className="font-bold">AIしもんはまだ準備中です</p>
          <p className="text-xs mt-1">
            {isAdmin
              ? "ANTHROPIC_API_KEY と ai-shimon/ のプロンプトファイルを設定すると使えるようになります（マスタ設定の「AIしもん」で状態を確認できます）。"
              : "使えるようになったらお知らせします。急ぎの相談は、しもんさんか幹部に直接どうぞ。"}
          </p>
        </div>
      )}

      {/* はじめの案内（会話が無いときだけ） */}
      {turns.length === 0 && (
        <section className="card">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
              <Icon name="bot" className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-ink-900">しもんの考え方をベースにした、みんなの壁打ち相手です</p>
              <p className="text-sm text-ink-600 mt-1 leading-relaxed">
                一人で抱えて止まってしまう時間を減らして、次の一歩を自分で決められるように。
                後輩のこと、自分のこと、お客様のこと、なんでも大丈夫。愚痴だけでも大丈夫です。
              </p>
            </div>
          </div>
          <p className="text-[11px] font-bold text-ink-400 mt-4 mb-1.5">たとえば、こんなふうに</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="chip !justify-start text-left !rounded-2xl !py-2 !px-3 max-w-full"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 会話 */}
      {turns.length > 0 && (
        <div className="space-y-2.5">
          {turns.map((t, i) => {
            const isLast = i === turns.length - 1;
            const typing = sending && isLast && t.role === "assistant";
            return (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                {t.role === "assistant" && (
                  <span className="w-8 h-8 shrink-0 mr-2 mt-0.5 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
                    <Icon name="bot" className="w-4 h-4" />
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                    t.role === "user"
                      ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white rounded-br-md"
                      : "bg-white border border-ink-200 text-ink-900 rounded-bl-md"
                  }`}
                >
                  {t.content}
                  {typing && (
                    <span className="inline-block w-2 h-4 align-middle ml-0.5 bg-brand-400 animate-pulse rounded-sm" aria-label="入力中" />
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-600 text-xs font-bold px-3 py-2">{error}</p>}

      {/* 入力欄（下部タブの上に固定） */}
      <div className="form-actions">
        <div className="rounded-2xl border border-brand-200 bg-white p-2 shadow-[0_2px_10px_rgba(93,80,58,0.08)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={!ready}
            placeholder={ready ? "話し言葉のままで大丈夫。ゆっくりでいいよ" : "準備中です"}
            aria-label="相談内容"
            className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-ink-300 disabled:opacity-60"
          />
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-bold text-ink-400 underline"
              disabled={turns.length === 0 && !input}
            >
              新しく相談する
            </button>
            <span className="text-[10px] text-ink-300 hidden sm:inline">⌘/Ctrl＋Enterで送信</span>
            <div className="ml-auto flex items-center gap-2">
              {sending && (
                <button type="button" onClick={stop} className="chip !py-1.5 !px-3 !min-h-8 text-[11px]">
                  止める
                </button>
              )}
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!ready || sending || !input.trim()}
                className="btn-primary !min-h-10 !py-2 !px-4 text-sm disabled:opacity-50"
              >
                <Icon name="send" className="w-4 h-4" />
                送る
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 使い方（05_スタッフ向け使い方ガイド の要点） */}
      <details className="card !py-3">
        <summary className="cursor-pointer text-sm font-bold text-brand-700">AIしもんの使い方・できないこと</summary>
        <div className="mt-3 space-y-3 text-sm text-ink-700 leading-relaxed">
          <div>
            <p className="font-bold text-ink-800">どんなことを相談していいの？</p>
            <p className="text-xs mt-0.5">
              なんでも大丈夫です。後輩・部下のこと／自分自身の迷い／お客様への接し方／カリキュラムや技術の進め方／仕組みづくり／しもんのこと。
              「今日はもう疲れました」から始めても構いません。
            </p>
          </div>
          <div>
            <p className="font-bold text-ink-800">使い方のコツ</p>
            <ul className="text-xs mt-0.5 list-disc list-inside space-y-0.5">
              <li>名前はログインから分かるので、名乗らなくて大丈夫。かしこまらず、話し言葉のままで</li>
              <li>すぐ答えが返ってこなくても焦らない。質問を返してくることが多い（自分の言葉で考えを整理するため）</li>
              <li>「で、どう思う？」と聞かれたら、思ったままを返す。正解を言おうとしなくていい</li>
              <li>最後に「1週間以内にやること」を聞かれる。そこまでやると壁打ちが完了</li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-ink-800">できないこと（正直に「分からない」と言います）</p>
            <ul className="text-xs mt-0.5 list-disc list-inside space-y-0.5">
              <li>カット・カラーの具体的な手順 → 動画や先輩に直接</li>
              <li>給与・歩合・仕入れ値 → しもんさんか幹部に直接</li>
              <li>誰かの評価（「あの子ランク上げていい？」）→ 面談で本人・上司と</li>
              <li>最新の経営数字・出店計画 → しもんさんに直接</li>
            </ul>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="font-bold text-amber-800">人に相談してほしいこと（AIで抱えないでください）</p>
            <ul className="text-xs mt-0.5 list-disc list-inside space-y-0.5 text-amber-900">
              <li>心や体がしんどい（自分のことでも、後輩のことでも）</li>
              <li>ハラスメント・いじめ・お金のトラブル</li>
              <li>お客様から怖い思いをさせられた → その場ですぐ上司へ。安全が最優先</li>
              <li>クレームが起きた → まず上司に報告。初動30分が勝負</li>
              <li>辞めたい／辞めさせたい</li>
            </ul>
          </div>
          <p className="text-xs text-ink-500">
            AIしもんは、しもん本人ではありません。言い間違い・勘違いをすることがあります。
            「これしもんさんっぽくないな」と思ったら、しもんさんに直接教えてください。
            人に相談しなくていい、という意味でもありません。一人じゃないので、仲間や先輩も頼ってください。
          </p>
          <p className="text-[11px] text-ink-400">
            会話の履歴はこの端末にだけ残ります（サーバーには保存しません）。
            <Link href="/staff/help" className="underline ml-1">使い方ガイド</Link>
          </p>
        </div>
      </details>
    </div>
  );
}
