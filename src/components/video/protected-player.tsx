"use client";

// 依頼20：アプリの中だけで見られる動画のプレーヤー。
//  ・再生のURLはサーバーから期限つきで受け取る（ログインしていないと再生できない。URLを人に送っても時間が経つと見られない）
//  ・ダウンロードのボタン・長押し／右クリックの保存・ピクチャー・イン・ピクチャー・外部の画面への出力を出さない
//    （iPhone の全画面プレーヤーに切り替わると名前の重ね表示が消えるため、アプリの中の再生ボタン・シークバーで操作する）
//  ・画面録画は止められないので、再生中は見ている人の名前と日時を薄く重ね、場所をときどき動かす
//  ・どこまで見たかを10秒ごと・止めたとき・見終わったときに記録する

import { useCallback, useEffect, useRef, useState } from "react";

interface Source {
  kind: "hls" | "mp4";
  src: string;
  expiresAt: number;
  unprotected: boolean;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ProtectedPlayer({ videoId, viewerName, startAt = 0 }: { videoId: string; viewerName: string; startAt?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mark, setMark] = useState({ top: 18, left: 12 });
  const lastSent = useRef(0);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/curriculum/video/${videoId}/play`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Source & { error?: string };
    if (!res.ok || !data.src) {
      setError(data.error ?? "再生できませんでした");
      return null;
    }
    setSource(data);
    return data;
  }, [videoId]);

  // 動画の読み込み（HLSは Safari ならそのまま、それ以外は hls.js）
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    let cancelled = false;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (source.kind === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(source.src);
        hls.attachMedia(video);
        hlsRef.current = hls;
      });
    } else {
      video.src = source.src;
    }
    const onMeta = () => {
      setDuration(video.duration || 0);
      if (startAt > 0 && startAt < (video.duration || 0) - 5) video.currentTime = startAt;
    };
    video.addEventListener("loadedmetadata", onMeta);
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onMeta);
    };
  }, [source, startAt]);

  useEffect(() => {
    void load();
    return () => hlsRef.current?.destroy();
  }, [load]);

  // 名前の重ね表示を、ときどき動かす
  useEffect(() => {
    const t = setInterval(() => setMark({ top: 8 + Math.random() * 70, left: 6 + Math.random() * 55 }), 15000);
    return () => clearInterval(t);
  }, []);

  const send = useCallback(
    (force = false) => {
      const v = videoRef.current;
      if (!v) return;
      const now = Date.now();
      if (!force && now - lastSent.current < 10000) return;
      lastSent.current = now;
      void fetch("/api/curriculum/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, position: v.currentTime, duration: v.duration || 0 }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [videoId]
  );

  const toggle = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // 期限が切れていたら、新しいURLをもらってから再生
      if (source && Date.now() > source.expiresAt - 30000) {
        const pos = v.currentTime;
        const s = await load();
        if (!s) return;
        await new Promise((r) => setTimeout(r, 300));
        v.currentTime = pos;
      }
      await v.play().catch(() => setError("再生できませんでした。もう一度押してください"));
    } else {
      v.pause();
    }
  };

  const stamp = new Date().toLocaleDateString("ja-JP");
  return (
    <div className="space-y-2">
      {source?.unprotected && <p className="text-[11px] font-bold text-amber-700">試し用の動画です（保護された置き場所ではありません）</p>}
      <div className="relative overflow-hidden rounded-2xl bg-black select-none line-no-callout" onContextMenu={(e) => e.preventDefault()}>
        <video
          ref={videoRef}
          className="w-full aspect-video bg-black"
          playsInline
          preload="metadata"
          controlsList="nodownload noremoteplayback noplaybackrate"
          disablePictureInPicture
          disableRemotePlayback
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            send(true);
          }}
          onEnded={() => {
            setPlaying(false);
            send(true);
          }}
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime);
            send();
          }}
          onClick={() => void toggle()}
        />
        {/* 見ている人の名前（画面録画の持ち出しを防ぐため、薄く重ねる） */}
        <span
          className="pointer-events-none absolute text-white/35 text-sm font-bold whitespace-nowrap transition-all duration-1000 drop-shadow"
          style={{ top: `${mark.top}%`, left: `${mark.left}%` }}
          aria-hidden="true"
        >
          {viewerName}　{stamp}
        </span>
        <span className="pointer-events-none absolute bottom-2 right-3 text-white/25 text-[11px] font-bold" aria-hidden="true">
          ENi 社内限定
        </span>
        {!playing && (
          <button type="button" onClick={() => void toggle()} className="absolute inset-0 grid place-items-center" aria-label="再生">
            <span className="w-16 h-16 rounded-full bg-white/85 grid place-items-center text-2xl text-ink-900">▶</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void toggle()} className="btn-secondary btn-sm w-16">
          {playing ? "一時停止" : "再生"}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          className="flex-1 accent-brand-600"
          aria-label="再生位置"
        />
        <span className="text-xs tabular-nums text-ink-500 w-20 text-right">
          {fmt(time)} / {fmt(duration)}
        </span>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
