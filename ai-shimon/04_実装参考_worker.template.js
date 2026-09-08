// AIしもん — Cloudflare Workers 用
// このファイルは web/build.py が生成します。直接編集しないこと。
// 直すときは 配布用/ か web/app.html を直して、build.py を回し直す。

const APP_HTML  = __APP_HTML__;    // 画面（app.html）
const CORE_TEXT = __CORE_TEXT__;   // 毎回渡す土台（キャッシュが効く）
const EXTRA_MAP = __EXTRA_MAP__;   // 話題ごとの資料
const ROUTES    = __ROUTES__;      // どの言葉が出たらどの資料を足すか
const FALLBACK  = __FALLBACK__;    // どれにも当てはまらないとき

const DEFAULT_MODEL = "claude-sonnet-5"; // env.MODEL で上書きできる
const MAX_TOKENS = 1024;
const MAX_TURNS = 30;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

function authed(request, env) {
  let given = request.headers.get("x-eni-pass") || "";
  try { given = decodeURIComponent(given); } catch (e) {}
  const want = env.APP_PASSWORD || "";
  if (!want) return false;
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// 相談の中身から、渡す資料を決める（AIを使わないので費用ゼロ）
function pickExtras(msgs) {
  const recent = msgs.slice(-6).map((m) => m.content).join("\n");
  const picked = new Set();
  for (const [words, files] of ROUTES) {
    for (const w of words) {
      if (recent.indexOf(w) !== -1) {
        files.forEach((f) => picked.add(f));
        break;
      }
    }
  }
  if (picked.size === 0) FALLBACK.forEach((f) => picked.add(f));
  // 増えすぎたら費用がかさむので上限をつける
  return Array.from(picked).sort().slice(0, 4);
}

async function handleChat(request, env) {
  if (!authed(request, env)) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  let msgs = Array.isArray(body.messages) ? body.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!msgs.length) return json({ error: "no messages" }, 400);
  if (msgs[0].role !== "user") msgs = msgs.slice(1);
  if (!msgs.length) return json({ error: "no messages" }, 400);

  const extras = pickExtras(msgs);
  const extraText = extras.map((n) => EXTRA_MAP[n] || "").join("");

  // 土台と話題ぶんを分けて、それぞれキャッシュ対象にする
  const system = [
    { type: "text", text: CORE_TEXT, cache_control: { type: "ephemeral" } },
  ];
  if (extraText) {
    system.push({ type: "text", text: extraText, cache_control: { type: "ephemeral" } });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: system,
      messages: msgs,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      'data: {"error":"ごめん、いまうまく返せなかった。もう一回送ってもらえる？"}\n\ndata: [DONE]\n\n',
      { headers: { "content-type": "text/event-stream;charset=utf-8" } }
    );
  }

  // Anthropic の SSE を、画面が扱いやすい形（{t:"文字"}）に詰め替えて流す
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  (async () => {
    const reader = upstream.body.getReader();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;
          let ev;
          try { ev = JSON.parse(raw); } catch (e) { continue; }
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
            await writer.write(enc.encode("data: " + JSON.stringify({ t: ev.delta.text }) + "\n\n"));
          }
        }
      }
    } catch (e) {
      await writer.write(enc.encode('data: {"error":"途中で切れちゃった。もう一回いける？"}\n\n'));
    } finally {
      await writer.write(enc.encode("data: [DONE]\n\n"));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream;charset=utf-8",
      "cache-control": "no-cache, no-store",
      "connection": "keep-alive",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ping") {
      return authed(request, env) ? json({ ok: true }) : json({ error: "unauthorized" }, 401);
    }
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      return handleChat(request, env);
    }

    return new Response(APP_HTML, {
      headers: {
        "content-type": "text/html;charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
        "referrer-policy": "no-referrer",
      },
    });
  },
};
