// 会社のノーション（考え方・ルール・マニュアルを書いてある場所）への接続先。
// 「ENiについて」と「マニュアルまとめ」の2つを、スマホの下部タブ「ノーション」から開けるようにしている。
//
// URLは管理者がマスタ設定で差し替えられる。ここの fallback は、いま共有されているページ。
// 接続先を増やすときは、この配列に1つ足すだけでよい
// （マスタ設定の入力欄・一覧カード・下部タブの飛び先がすべてこの定義から作られる）。

/** ノーションの接続先1つぶん。key はマスタ設定のキーを兼ねる */
export interface NotionDestination {
  key: string;
  /** マスタ設定の見出し・一覧カードの題名 */
  label: string;
  /** マスタ設定の説明文 */
  note: string;
  placeholder: string;
  /** 未設定のときに開くURL */
  fallback: string;
  /** 一覧カードに出す一言 */
  summary: string;
}

export const NOTION_ABOUT_URL_KEY = "notion_about_url";
export const NOTION_MANUAL_URL_KEY = "notion_manual_url";

export const NOTION_DESTINATIONS: NotionDestination[] = [
  {
    key: NOTION_ABOUT_URL_KEY,
    label: "ENiについて",
    note: "ノーションの「ENiについて」のページ。スマホ下部タブの「ノーション」から開きます",
    placeholder: "https://app.notion.com/p/...",
    fallback: "https://app.notion.com/p/ENi-3046360643ba80319932fa8fc96a64a6",
    summary: "ENiの考え方・大切にしていること・ルールがまとまっています。迷ったらまずここ。",
  },
  {
    key: NOTION_MANUAL_URL_KEY,
    label: "マニュアルまとめ",
    note: "ノーションの「マニュアルまとめ」のページ。スマホ下部タブの「ノーション」から開きます",
    placeholder: "https://app.notion.com/p/...",
    fallback: "https://app.notion.com/p/3046360643ba80e3913cff4b9886ef79",
    summary: "日々の業務の手順やマニュアルがまとまっています。やり方を確かめたいときに。",
  },
];
