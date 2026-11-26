import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LIFF（LINEアプリ内ブラウザ）から開くページがあるため X-Frame-Options は付けない
  poweredByHeader: false,
  // 写真（社内SNS・領収書・Wikiの画像など）をサーバーアクションで送るため、受け取れる大きさを広げる
  // （初期値の1MBでは写真2〜3枚で止まる。Vercel の関数が受け取れる上限は4.5MB）
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  // AIしもんのプロンプト・知識ファイル（ai-shimon/）は実行時に fs で読むので、Vercel の関数に同梱する
  outputFileTracingIncludes: {
    "/api/ai-shimon/chat": ["./ai-shimon/**/*"],
    "/admin/settings": ["./ai-shimon/**/*"],
  },
  // Claude のカスタムコネクタ（依頼21・MCP）は、決まった場所（/.well-known/…）に接続の案内を探しに来る
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/resource" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/metadata" },
    ];
  },
  // Claude からの接続の許可の画面（依頼21）は、ほかのサイトの中に埋め込ませない（クリックをだます攻撃を防ぐ）
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  // 旧「シフト管理（早番・遅番）」の画面は、シフト（/staff/schedule・/admin/schedule）に一本化した。
  // ブックマークや古いお知らせのリンクから来ても迷わないよう転送する（?month= などはそのまま引き継がれる）
  async redirects() {
    return [
      { source: "/staff/shift", destination: "/staff/schedule", permanent: false },
      { source: "/staff/shift/all", destination: "/staff/schedule?view=store", permanent: false },
      { source: "/staff/shift/request", destination: "/staff/schedule/dayoff", permanent: false },
      { source: "/admin/shift", destination: "/admin/schedule", permanent: false },
      { source: "/admin/shift/board", destination: "/admin/schedule", permanent: false },
      { source: "/admin/shift/settings", destination: "/admin/schedule/settings", permanent: false },
    ];
  },
};

export default nextConfig;
