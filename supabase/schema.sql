-- ============================================================
-- EREYS DASH データベーススキーマ（Supabase / PostgreSQL）
-- 適用方法：Supabaseダッシュボード → SQL Editor → このファイルの内容を貼り付けて実行
-- ============================================================

-- ---- テーブル定義 ----

-- 店舗マスタ（1店舗運用を前提とするが、複数店舗も登録可能な設計）
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  gps_radius_m integer not null default 100,          -- GPS打刻の許容半径（m）
  attendance_enabled boolean not null default true,   -- 勤怠運用ON/OFF（任意運用）
  created_at timestamptz not null default now()
);

-- スタッフマスタ（ログイン情報を含む。パスワードはscryptハッシュ）
-- job_type: ''=未設定（アイサロン等）/ stylist / assistant（ENiのヘアスタッフに設定）
-- is_executive: 幹部（欠勤・早退の閲覧、発注管理、ペア設定などができる）
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name text not null,
  login_id text not null unique,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  job_type text not null default '' check (job_type in ('', 'stylist', 'assistant')),
  rank text not null default '' check (rank in ('', 'first', 'middle', 'final')),  -- アシスタントのランク
  is_executive boolean not null default false,
  fixed_overtime_hours integer not null default 20,   -- 固定残業時間（月）
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 既存DBに後から列を足す場合（本番に staff が既にある場合）に実行：
--   alter table staff add column if not exists job_type text not null default '';
--   alter table staff add column if not exists rank text not null default '';
--   alter table staff add column if not exists is_executive boolean not null default false;

-- 顧客（LINE友だち追加時に自動登録）
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  full_name text not null,
  created_at timestamptz not null default now()
);

-- カウンセリング回答（項目可変のためJSONBで保存）
create table if not exists counseling_responses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed')), -- 未確認/確認済み
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references staff(id),
  confirmed_at timestamptz
);

-- 日報（スタッフ×日付でユニーク。再保存は上書き）
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  report_date date not null,
  new_clients integer not null default 0,
  repeat_clients integer not null default 0,
  next_bookings integer not null default 0,
  service_sales integer not null default 0,
  option_sales integer not null default 0,
  retail_sales integer not null default 0,
  memo text not null default '',
  good_point text not null default '',   -- 今日お客様やスタッフに喜んでいただけたこと
  improvement text not null default '',  -- 今日の気付きや改善できそうな点
  message text not null default '',      -- ひとことメッセージ（任意）
  created_at timestamptz not null default now(),
  unique (staff_id, report_date)
);

-- 既存DBに後から列を足す場合（本番に daily_reports が既にある場合）に実行：
--   alter table daily_reports add column if not exists good_point text not null default '';
--   alter table daily_reports add column if not exists improvement text not null default '';
--   alter table daily_reports add column if not exists message text not null default '';

-- レジ締め・現金管理（店舗×日付でユニーク。スタッフ個人の日報とは別レコード）
create table if not exists cash_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  report_date date not null,
  cash_sales integer not null default 0,       -- 本日の現金売上高
  register_balance integer not null default 0, -- レジ現金残高（締め時点）
  moved_to_safe integer not null default 0,    -- 金庫へ移動額
  change_fund integer not null default 0,      -- レジおつり金の残高（翌日のおつり準備金）
  safe_balance integer not null default 0,     -- 金庫現金残高
  bank_deposit integer not null default 0,     -- 銀行への預入額
  memo text not null default '',
  created_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  unique (store_id, report_date)
);

-- 勤怠打刻（圏外打刻も監査用に is_valid=false で記録。集計対象は true のみ）
create table if not exists attendances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  punch_type text not null check (punch_type in ('in', 'out')),
  punched_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  distance_m double precision not null,
  is_valid boolean not null
);

-- 次回予約（1週間前・前日リマインドの対象。*_sent_at で二重送信を防止）
-- status: scheduled=予約中 / confirmed=お客様確認済み / change_requested=変更希望あり / cancelled=お客様キャンセル
create table if not exists next_appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  scheduled_at timestamptz not null,
  staff_id uuid references staff(id),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'change_requested', 'cancelled')),
  requested_new_at timestamptz,            -- お客様が希望した変更後の日時
  change_note text not null default '',    -- 変更・キャンセル時のお客様メモ
  reminder_sent_at timestamptz,            -- 前日リマインド送信日時
  pre_reminder_sent_at timestamptz,        -- 1週間前の事前案内送信日時
  created_at timestamptz not null default now()
);

-- 既存DBに後から列を足す場合（本番に next_appointments が既にある場合）に実行：
--   alter table next_appointments add column if not exists status text not null default 'scheduled';
--   alter table next_appointments add column if not exists requested_new_at timestamptz;
--   alter table next_appointments add column if not exists change_note text not null default '';
--   alter table next_appointments add column if not exists pre_reminder_sent_at timestamptz;

-- ============================================================
-- 出勤スケジュール（基本パターン＋希望休。早番/遅番の旧シフトとは別機能）
-- ============================================================

-- 週の基本出勤パターン（スタッフ×曜日）。weekday: 0=日〜6=土。行が無い曜日は「休み」扱い
create table if not exists work_patterns (
  staff_id uuid not null references staff(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  is_working boolean not null default false,
  start_time text not null default '',   -- "10:00"（空文字は時間未設定）
  end_time text not null default '',
  primary key (staff_id, weekday)
);

-- 希望休（スタッフが「3ヶ月後の月」を対象に、当月7日までに申請する休み希望日）
create table if not exists dayoff_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

-- スケジュールの個別上書き（管理者の手動調整。パターン・希望休より優先）
create table if not exists schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  is_working boolean not null,
  start_time text not null default '',
  end_time text not null default '',
  note text not null default '',
  unique (staff_id, date)
);

-- 一斉配信の履歴
create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid not null references staff(id),
  body text not null,
  sent_at timestamptz not null default now(),
  recipient_count integer not null default 0
);

-- ============================================================
-- シフト管理（3店舗の勤務を一元管理）
-- ============================================================

-- シフトルール（1行のみ。管理者画面から変更）
create table if not exists shift_rules (
  id integer primary key default 1 check (id = 1),
  max_consecutive_days integer not null default 5,          -- 連勤上限
  min_staff_per_store_per_day integer not null default 2,   -- 各店舗・各日の最低人数（日単位）
  request_deadline_day integer not null default 25          -- 希望締切＝対象月の前月◯日
);

-- シフト希望（月単位：備考・提出日時）
create table if not exists shift_request_months (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  note text not null default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, target_month)
);

-- シフト希望（日単位）。行が無い日は「指定なし＝早遅どちらでも可」
create table if not exists shift_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  date date not null,
  preference text not null check (preference in ('early', 'late', 'off')),
  unique (staff_id, date)
);

-- その月に勤務可能な店舗（複数選択）
create table if not exists staff_available_stores (
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  store_id uuid not null references stores(id),
  primary key (staff_id, target_month, store_id)
);

-- シフト割当（1スタッフ1日1件。draft=下書き/confirmed=確定・公開）
create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  date date not null,
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  shift_type text not null check (shift_type in ('early', 'late')),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

-- ============================================================
-- ENi（ヘアサロン）向け機能
-- ============================================================

-- スタイリスト日報／アシスタント週報（項目可変のためJSONBで保存）
-- kind: stylist=日報（period_key=日付）/ weekly=週報（period_key=週の月曜）
create table if not exists eni_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stylist', 'weekly')),
  staff_id uuid not null references staff(id) on delete cascade,
  period_key date not null,
  answers jsonb not null default '{}',
  comment text not null default '',            -- 上司からの全体コメント
  commented_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  unique (kind, staff_id, period_key)
);

-- 練習記録（月間活動記録表のシステム化。1回の練習＝1行）
create table if not exists practice_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  practice_date date not null,
  minutes integer not null check (minutes > 0),
  partner_staff_id uuid references staff(id),
  partner_name text not null default '',   -- モデルさん等の自由記入（スタッフ選択時は空）
  content text not null default '',        -- 練習内容（任意）
  created_at timestamptz not null default now()
);

-- 練習ペア（月ごとに、メンバー→ついてもらう先輩を割り当てる）
create table if not exists practice_pairs (
  id uuid primary key default gen_random_uuid(),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  member_staff_id uuid not null references staff(id) on delete cascade,
  partner_staff_id uuid not null references staff(id) on delete cascade,
  unique (target_month, member_staff_id)
);

-- ミーティング（1on1・会議体・全体など）＋議事録の提出管理
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_type text not null default '1on1' check (meeting_type in ('1on1', 'all', 'other')),
  committee text not null default '',          -- 会議体（幹部会議・教育チーム 等のテンプレキー）
  title text not null default '',
  agenda text not null default '',             -- アジェンダ・事前確認事項
  meeting_date date not null,
  start_time text not null default '',
  host_staff_id uuid not null references staff(id),
  guest_staff_id uuid references staff(id),
  participants jsonb not null default '[]',     -- 会議体の複数参加者（staff_idの配列）
  minutes_text text not null default '',       -- 議事録（整形済みMarkdown）
  minutes_photo text not null default '',      -- 議事録の写真（データURL）
  minutes_ai boolean not null default false,   -- AIで整形したか
  minutes_done boolean not null default false,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now()
);

-- 既存DBに後から列を足す場合（本番に meetings が既にある場合）に実行：
--   alter table meetings add column if not exists committee text not null default '';
--   alter table meetings add column if not exists agenda text not null default '';
--   alter table meetings add column if not exists participants jsonb not null default '[]';
--   alter table meetings add column if not exists minutes_ai boolean not null default false;

-- 議事録から整理したタスク（誰が・何を・いつまでに）。議事録の保存ごとに入れ替える
create table if not exists meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  title text not null,                          -- 何を
  assignee_staff_id uuid references staff(id) on delete set null,  -- 誰が（一致した場合）
  assignee_name text not null default '',       -- 誰が（表示名。未一致でも残す）
  due_date date,                                -- いつまでに（未定はnull）
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 組織図（シナジーマップ）のチーム所属。team_key は src/lib/eni/org.ts の定義キー
create table if not exists org_members (
  id uuid primary key default gen_random_uuid(),
  team_key text not null,
  staff_id uuid not null references staff(id) on delete cascade,
  role_label text not null default '',          -- 'リーダー' など（空文字はメンバー）
  sort_order integer not null default 0,
  unique (team_key, staff_id)
);

-- 欠勤・早退・遅刻の報告（閲覧は幹部・管理者のみ）
create table if not exists absence_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  absence_date date not null,
  kind text not null check (kind in ('absence', 'early_leave', 'late')),
  hours numeric not null default 0,
  reason text not null default '',
  reported_by uuid not null references staff(id),
  created_at timestamptz not null default now()
);

-- 発注・購入申請（wig=ウィッグ / store_sale=社販 / material=商材）
create table if not exists order_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  category text not null check (category in ('wig', 'store_sale', 'material')),
  item_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  note text not null default '',
  status text not null default 'requested' check (status in ('requested', 'ordered', 'received')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 今日のスケジュール（1人1日1件）。構造化フォーム or スケジュール帳の写真。
-- fields: { goal, horenso, todo, timetable } ／ seen_by: ペアの先輩が確認したら記録
create table if not exists daily_plans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  plan_date date not null,
  content text not null default '',
  fields jsonb not null default '{}',
  photo text not null default '',
  seen_by uuid references staff(id),
  seen_at timestamptz,
  unique (staff_id, plan_date)
);

-- 理想のスケジュール（scope: month_goal=今月の目標 / week1〜week4=各週の理想。旧week/monthも許容）
-- content は週グリッドのJSONまたはテキスト。image は貼り付け画像（データURL）。
create table if not exists ideal_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  scope text not null,
  content text not null default '',
  image text not null default '',
  updated_at timestamptz not null default now(),
  unique (staff_id, scope)
);

-- 既存DBに後から列を足す/制約を緩める場合に実行：
--   alter table ideal_schedules add column if not exists image text not null default '';
--   alter table ideal_schedules drop constraint if exists ideal_schedules_scope_check;

-- タイムテーブルのよくある項目（「MTG」「練習」等）。datalistの候補に使う
create table if not exists schedule_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---- インデックス ----
create index if not exists idx_counseling_status on counseling_responses (status, submitted_at desc);
create index if not exists idx_counseling_customer on counseling_responses (customer_id);
create index if not exists idx_reports_date on daily_reports (report_date);
create index if not exists idx_reports_staff_date on daily_reports (staff_id, report_date);
create index if not exists idx_cash_reports_date on cash_reports (report_date);
create index if not exists idx_attendances_punched on attendances (punched_at);
create index if not exists idx_attendances_staff on attendances (staff_id, punched_at);
create index if not exists idx_appointments_scheduled on next_appointments (scheduled_at);
create index if not exists idx_appointments_reminder on next_appointments (reminder_sent_at, scheduled_at);
create index if not exists idx_dayoff_requests_date on dayoff_requests (date);
create index if not exists idx_schedule_overrides_date on schedule_overrides (date);
create index if not exists idx_eni_reports_period on eni_reports (kind, period_key);
create index if not exists idx_practice_records_date on practice_records (practice_date);
create index if not exists idx_practice_records_staff on practice_records (staff_id, practice_date);
create index if not exists idx_meetings_date on meetings (meeting_date);
create index if not exists idx_meeting_tasks_meeting on meeting_tasks (meeting_id);
create index if not exists idx_meeting_tasks_open on meeting_tasks (done, due_date);
create index if not exists idx_org_members_team on org_members (team_key);
create index if not exists idx_absence_reports_date on absence_reports (absence_date);
create index if not exists idx_order_requests_created on order_requests (created_at);
create index if not exists idx_daily_plans_date on daily_plans (plan_date);
create index if not exists idx_shift_requests_month on shift_requests (target_month);
create index if not exists idx_shift_available_month on staff_available_stores (target_month);
create index if not exists idx_shift_assignments_month on shift_assignments (target_month, date);

-- ---- Row Level Security ----
-- 本システムはサーバー側からサービスロールキーのみで接続する構成のため、
-- 全テーブルでRLSを有効化し、ポリシーは作成しない（＝anonキーからは一切アクセス不可）。
alter table stores enable row level security;
alter table staff enable row level security;
alter table customers enable row level security;
alter table counseling_responses enable row level security;
alter table daily_reports enable row level security;
alter table cash_reports enable row level security;
alter table attendances enable row level security;
alter table next_appointments enable row level security;
alter table broadcasts enable row level security;
alter table shift_rules enable row level security;
alter table shift_request_months enable row level security;
alter table shift_requests enable row level security;
alter table staff_available_stores enable row level security;
alter table shift_assignments enable row level security;
alter table work_patterns enable row level security;
alter table dayoff_requests enable row level security;
alter table schedule_overrides enable row level security;
alter table eni_reports enable row level security;
alter table practice_records enable row level security;
alter table practice_pairs enable row level security;
alter table meetings enable row level security;
alter table meeting_tasks enable row level security;
alter table org_members enable row level security;
alter table absence_reports enable row level security;
alter table order_requests enable row level security;
alter table daily_plans enable row level security;
alter table ideal_schedules enable row level security;
alter table schedule_presets enable row level security;

-- ---- 初期データ（重複しないようガード付き。何度実行しても安全）----
-- TODO: 店舗名・住所・緯度経度は実際の値に書き換える。最初の行が「本店」扱い。
--       店舗を1件でも登録済みの場合、この insert はスキップされます（重複防止）。
insert into stores (name, address, lat, lng, gps_radius_m, attendance_enabled)
select v.name, v.address, v.lat, v.lng, v.gps_radius_m, v.attendance_enabled
from (values
  ('EREYS 自由が丘店', '東京都目黒区自由が丘1-14-14', 35.608614, 139.670152, 100, true),
  ('ENi 自由が丘店',   '東京都目黒区自由が丘1-14-14', 35.608614, 139.670152, 100, true)
) as v(name, address, lat, lng, gps_radius_m, attendance_enabled)
where not exists (select 1 from stores);

-- シフトルールの初期値（連勤上限5日・各店舗2名・締切は前月25日）
insert into shift_rules (id) values (1)
on conflict (id) do nothing;

-- タイムテーブルのよくある項目の初期値（重複しないよう on conflict do nothing）
insert into schedule_presets (label, sort_order)
values ('朝礼', 10), ('入客アシスト', 20), ('施術', 30), ('練習', 40), ('MTG', 50),
       ('休憩', 60), ('事務', 70), ('撮影', 80), ('掃除', 90), ('退勤', 100)
on conflict (label) do nothing;

-- 初期管理者アカウント
--   ログインID: admin ／ パスワード: admin1234
--   ※ 運用開始前に必ず管理画面（マスタ設定）からパスワードを変更すること。
--   別のパスワードでハッシュを作る場合: npm run hash-password -- '新しいパスワード'
insert into staff (store_id, name, login_id, password_hash, role, fixed_overtime_hours)
select
  id,
  '管理者',
  'admin',
  'scrypt$16384$8$1$Wr6MznwmDmuZvXdeyeJaHg==$5F175uSYVZMjfLV0px9t75y2ONErZ27gGktSY8nvLto=',
  'admin',
  20
from stores
order by created_at, name
limit 1
on conflict (login_id) do nothing;
