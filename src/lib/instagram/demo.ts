// 依頼22：デモ（Instagramの連携が未設定のとき）の見本の数字。毎回同じ数字になるよう、人と日付から作る。

export const DEMO_CAPTIONS = ["透明感カラーで春らしく", "ショートボブの仕上げ", "ハイライトのビフォーアフター", "まとまるレイヤーカット", "髪質改善トリートメント", "前髪カットだけでも印象が変わります"];

export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function demoDay(staffId: string, date: string, base: number, index: number) {
  const rnd = seeded(`${staffId}:${date}`);
  const reach = Math.round(base * (0.4 + rnd() * 0.5));
  return {
    followers: base + index * 3 + Math.round(rnd() * 4),
    follows: 300 + Math.round(rnd() * 5),
    mediaCount: 120 + Math.floor(index / 3),
    metrics: {
      reach,
      views: Math.round(reach * (1.6 + rnd())),
      accounts_engaged: Math.round(reach * 0.08),
      total_interactions: Math.round(reach * 0.12),
      likes: Math.round(reach * 0.09),
      comments: Math.round(rnd() * 6),
      shares: Math.round(rnd() * 5),
      saves: Math.round(rnd() * 8),
      profile_links_taps: Math.round(rnd() * 4),
    },
  };
}

