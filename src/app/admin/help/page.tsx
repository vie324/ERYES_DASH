import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { HelpAccordion, HelpFaq, HelpHeading, HelpTimeline } from "@/components/help";

export const dynamic = "force-dynamic";

// 管理者向けヘルプ：運用サイクルと各管理機能の使い方をまとめたページ
export default async function AdminHelpPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader title="使い方ガイド（管理者）" backHref="/admin" />

      <p className="text-sm text-ink-500 mb-2">
        オーナー・管理者向けの運用ガイドです。日々はダッシュボードで数字とアラートを見て、
        月の節目にシフト・成績・CSVをまとめる、という流れになります。
      </p>

      <HelpHeading>毎日のこと</HelpHeading>
      <div className="card">
        <HelpTimeline
          steps={[
            {
              time: "朝・営業前",
              title: "ダッシュボードで全体を把握",
              body: "本日・今月の売上、明日のリマインド予定、当月のLINE送信数が一目で分かります。残業や送信数の注意があると上部にアラートが出ます。",
              href: "/admin",
            },
            {
              time: "予約が入ったら",
              title: "次回予約を登録（前日リマインド）",
              body: "顧客一覧または次回予約の画面でお客様の次回来店日時を登録すると、前日19時に自動でLINEリマインドが送られます。",
              href: "/admin/appointments",
            },
            {
              time: "随時",
              title: "カウンセリング・日報の確認",
              body: "新しいカウンセリング回答や、スタッフが入力した日報・現金管理をいつでも閲覧できます。",
              href: "/admin/reports",
            },
          ]}
        />
      </div>

      <HelpHeading>毎月のこと</HelpHeading>
      <div className="card">
        <HelpTimeline
          steps={[
            {
              time: "毎月15日",
              title: "シフト希望の募集（自動）",
              body: "翌月分の希望提出の案内が全スタッフへ自動で出ます（毎月15日）。提出状況はシフト管理画面で確認できます。",
              href: "/admin/shift",
            },
            {
              time: "締切後（既定25日）",
              title: "シフトを自動割当 → 調整 → 確定",
              body: "割当ボードで「自動割当」を押すと下書きができます。赤い警告（人数不足・連勤超過など）を手で直してから「確定」すると、全スタッフに公開されます。",
              href: "/admin/shift/board",
            },
            {
              time: "月初・締め",
              title: "成績の確認とCSV出力",
              body: "成績・日報で前月の数字を確認し、CSV出力から売上CSV・現金管理CSVをダウンロードして税理士へ提出します。",
              href: "/admin/csv",
            },
          ]}
        />
      </div>

      <HelpHeading>各機能の使い方</HelpHeading>
      <div className="space-y-3">
        <HelpAccordion
          icon="barChart"
          title="成績・日報"
          summary="全スタッフの売上・予約率・現金管理を月単位で確認"
          href="/admin/reports"
          steps={[
            "上部の矢印で見たい月を選びます。",
            "月間サマリー（売上合計・次回予約率・新規比）とスタッフ別の成績を確認します。",
            "下にスクロールするとレジ締め・現金管理の月次一覧（差額マーク付き）も見られます。",
            "日別明細はスタッフのチップで絞り込めます。",
          ]}
          notes={[
            "サロンボードとの突合では、割引が反映されたこのシステムの数値を正としてください。",
          ]}
        />
        <HelpAccordion
          icon="calendar"
          title="シフト管理（希望集計→割当→確定）"
          summary="希望の確認・自動割当・手動調整・公開"
          href="/admin/shift"
          steps={[
            "シフト管理で、対象月の提出状況と各スタッフの希望（休み・店舗・早遅）を確認します。",
            "「割当ボードを開く」→「自動割当を実行」で下書きを作ります。",
            "赤い警告（人数不足・休み希望に割当・連勤超過など）を、表のセルで＋追加／×削除して直します。",
            "「確定する」にチェックを入れて確定すると、全スタッフに公開されます。",
          ]}
          notes={[
            "自動割当はあくまで下書きです。最終判断は手動調整で行ってください。",
            "連勤上限・最低人数・締切日は「ルール設定」で変更できます。",
            "希望を未提出のスタッフは自動割当の対象外です（手動では追加できます）。",
          ]}
        />
        <HelpAccordion
          icon="bell"
          title="次回予約・前日リマインド"
          summary="来店日時を登録すると前日19時に自動でLINE送信"
          href="/admin/appointments"
          steps={[
            "次回予約の画面でお客様を選び、来店日時を入力して登録します。",
            "前日の19時に、対象のお客様へLINEで自動リマインドが送られます。",
            "送信済みかどうかは予約一覧で確認できます（二重送信はされません）。",
          ]}
          notes={[
            "LINE未連携のお客様には送信されません（お電話などで個別にご案内ください）。",
            "リマインドもLINEの無料枠（月の送信数）を消費します。",
          ]}
        />
        <HelpAccordion
          icon="megaphone"
          title="一斉配信"
          summary="登録済みの全顧客へお知らせをLINE送信"
          href="/admin/broadcast"
          steps={[
            "本文を入力します（臨時休業・キャンペーンのお知らせなど）。",
            "送信対象の人数を確認し、確認チェックを入れます。",
            "「全員に送信する」を押すと、LINE連携済みの全顧客へ届きます。",
          ]}
          notes={[
            "送信は取り消せません。本文をよく確認してから送ってください。",
            "人数分の送信数を消費します。無料枠（月500通）の残りにご注意ください。",
          ]}
        />
        <HelpAccordion
          icon="fileText"
          title="CSV出力（税理士提出用）"
          summary="売上・現金管理を期間指定でダウンロード"
          href="/admin/csv"
          steps={[
            "出したい期間（開始日・終了日）を選びます。",
            "「売上CSV」または「現金管理CSV」のダウンロードボタンを押します。",
            "ダウンロードしたファイルをそのまま税理士へ共有できます。",
          ]}
          notes={[
            "Excelで文字化けしないよう、UTF-8（BOM付き）で出力されます。",
            "出力する項目は、税理士の指定に合わせて後から変更できます。",
          ]}
        />
        <HelpAccordion
          icon="clock"
          title="勤怠管理"
          summary="労働時間と残業の月次集計・超過アラート"
          href="/admin/attendance"
          steps={[
            "月を選ぶと、スタッフごとの出勤日数・労働時間・残業が一覧で出ます。",
            "固定残業に近づく・超えると「注意」「超過」が表示されます。",
            "スタッフ名から日別の打刻も確認できます。",
          ]}
          notes={[
            "勤怠は任意運用です。打刻のない日があっても問題ありません。",
            "店舗から100m以内の有効な打刻だけが集計対象です。",
          ]}
        />
        <HelpAccordion
          icon="user"
          title="顧客一覧"
          summary="LINE登録済みのお客様の確認・次回予約登録"
          href="/admin/customers"
          steps={[
            "名前で検索してお客様を探せます。",
            "お客様を開くと、カウンセリング履歴と次回予約の登録ができます。",
            "LINE登録時の名前が誤っている場合はここで修正できます。",
          ]}
          notes={["顧客はお客様が公式LINEを友だち追加し、名前を送ると自動で登録されます。"]}
        />
        <HelpAccordion
          icon="sliders"
          title="マスタ設定"
          summary="店舗・スタッフ・勤怠運用の設定"
          href="/admin/settings"
          steps={[
            "店舗ごとに、住所・GPSの位置（緯度経度）・許容半径・勤怠ON/OFFを設定します。",
            "スタッフの追加・氏名や権限の変更・パスワード再設定ができます。",
            "店舗の追加もここから行えます（追加後に正しい位置情報を入れてください）。",
          ]}
          notes={[
            "緯度経度はGoogleマップで店舗を右クリックして出る数値を貼り付けます。",
            "自分自身の管理者権限・有効フラグは外せません（締め出し防止）。",
          ]}
        />
      </div>

      <HelpHeading>導入・初期設定（最初に1回）</HelpHeading>
      <div className="card text-sm text-ink-600 space-y-2">
        <p className="font-bold text-ink-800">運用を始める前に、以下を一度だけ設定してください。</p>
        <ol className="space-y-1.5 list-decimal list-inside">
          <li>マスタ設定で3店舗の正しい住所・位置情報（緯度経度）を登録する。</li>
          <li>スタッフを全員登録し、それぞれにIDとパスワードを渡す。</li>
          <li>管理者（ご自身）の初期パスワードを必ず変更する。</li>
          <li>シフトのルール設定（連勤上限・最低人数・締切日）を実際の運用に合わせる。</li>
          <li>LINE公式アカウントの連携（カウンセリング・リマインド・配信を使う場合）。</li>
        </ol>
        <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold p-3 mt-2">
          重要：データの保存にはデータベース（Supabase）の接続が必要です。未接続の間は入力しても保存されません。
          接続手順は開発担当（このシステムの納品元）にご相談ください。
        </p>
      </div>

      <HelpHeading>こんなときは</HelpHeading>
      <HelpFaq
        items={[
          {
            q: "シフトを確定した後に変更したい",
            a: "確定後でも、割当ボードの表からスタッフの追加（＋）や削除（×）ができます。変更はすぐに全スタッフへ反映されます。なお、確定後は「自動割当のやり直し」はできません（手動調整のみ）。",
          },
          {
            q: "新しいスタッフが入った",
            a: "マスタ設定の「スタッフを追加」から氏名・ID・初期パスワード・権限を登録します。本人がログインして、その月のシフト希望（勤務できる店舗）を提出すれば、シフトの対象になります。",
          },
          {
            q: "店舗を増やしたい",
            a: "マスタ設定の店舗一覧から追加できます。追加した直後は位置情報が仮の値なので、Googleマップで調べた正しい緯度経度に必ず変更してください（GPS打刻に使われます）。",
          },
          {
            q: "LINEの送信数が上限に近い",
            a: "ダッシュボードと各画面に当月の送信数が出ます。無料枠（月500通）に近づくと注意表示が出ます。リマインドと一斉配信が送信数を消費するので、上限が気になる場合はLINEの有料プランへの切り替えをご検討ください。",
          },
          {
            q: "残業の「超過」アラートが出た",
            a: "勤怠管理画面で対象スタッフの労働時間を確認できます。固定残業時間はマスタ設定でスタッフごとに調整できます。",
          },
        ]}
      />

      <p className="mt-7 text-center">
        <Link href="/staff/help" className="text-sm font-bold text-brand-700 underline">
          スタッフ向けの使い方ガイドへ
        </Link>
      </p>
    </div>
  );
}
