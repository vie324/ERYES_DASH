-- ============================================================
-- 2026-11 依頼10〜23（追加開発）で使う新しいテーブル
-- ============================================================
-- ・追加だけです（既存のテーブル・列・データは変えません）。何度流しても同じ結果になります（if not exists）。
-- ・このアプリはサーバーからサービスロールのキーで読み書きするため、どのテーブルも RLS を有効にして
--   ポリシーは作りません（＝ブラウザ・anon キーからは読めない・書けない。既存のテーブルと同じ考え方）。
-- ・アプリの中の定義は src/lib/data/tables.ts。列を足すときは、ここに alter table … add column if not exists を足す。
-- ・テーブルが無い間も、アプリはエラーにならず、その機能だけ「準備中」になります。

create table if not exists staff_permissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  permission text not null default '',
  granted_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists staff_permissions_staff_id_permission_key on staff_permissions (staff_id, permission);
alter table staff_permissions enable row level security;

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  feature text not null default '',
  staff_id uuid,
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  ok boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_logs_created_at_idx on ai_usage_logs (created_at);
create index if not exists ai_usage_logs_feature_staff_id_created_at_idx on ai_usage_logs (feature, staff_id, created_at);
alter table ai_usage_logs enable row level security;

create table if not exists ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null default '',
  feature text not null default '',
  value jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_cache_cache_key_key on ai_cache (cache_key);
alter table ai_cache enable row level security;

create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null default '',
  run_key text not null default '',
  status text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists job_runs_job_key_run_key_key on job_runs (job_key, run_key);
alter table job_runs enable row level security;

create table if not exists input_submissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  input_key text not null default '',
  date date,
  first_submitted_at timestamptz,
  last_submitted_at timestamptz
);
create unique index if not exists input_submissions_staff_id_input_key_date_key on input_submissions (staff_id, input_key, date);
alter table input_submissions enable row level security;

create table if not exists sns_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default '',
  author_staff_id uuid,
  store_id uuid,
  category text not null default '',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,
  pinned_at timestamptz,
  pinned_by uuid,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sns_posts_created_at_idx on sns_posts (created_at);
alter table sns_posts enable row level security;

create table if not exists sns_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists sns_likes_post_id_staff_id_key on sns_likes (post_id, staff_id);
alter table sns_likes enable row level security;

create table if not exists sns_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid,
  staff_id uuid,
  body text not null default '',
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sns_comments_post_id_idx on sns_comments (post_id);
alter table sns_comments enable row level security;

create table if not exists thanks_extras (
  id uuid primary key default gen_random_uuid(),
  thanks_id uuid,
  from_staff_id uuid,
  to_staff_id uuid,
  from_name text not null default '',
  to_name text not null default '',
  body text not null default '',
  card_color text not null default '',
  stamp text not null default '',
  points integer not null default 0,
  is_private boolean not null default false,
  original_date date,
  source text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists thanks_extras_to_staff_id_idx on thanks_extras (to_staff_id);
create index if not exists thanks_extras_original_date_idx on thanks_extras (original_date);
alter table thanks_extras enable row level security;

create table if not exists thanks_awards (
  id uuid primary key default gen_random_uuid(),
  month text not null default '',
  status text not null default '',
  candidates jsonb not null default '[]'::jsonb,
  winners jsonb not null default '[]'::jsonb,
  message text not null default '',
  computed_at timestamptz,
  announced_at timestamptz,
  announced_by uuid,
  post_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists thanks_awards_month_key on thanks_awards (month);
alter table thanks_awards enable row level security;

create table if not exists ai_trainings (
  id uuid primary key default gen_random_uuid(),
  kind text not null default '',
  title text not null default '',
  body text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  source_staff_id uuid,
  source_thread_id text not null default '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ai_trainings enable row level security;

create table if not exists ai_training_revisions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid,
  action text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  edited_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ai_training_revisions_training_id_idx on ai_training_revisions (training_id);
alter table ai_training_revisions enable row level security;

create table if not exists wiki_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '',
  body text not null default '',
  visibility text not null default '',
  source_path text not null default '',
  deleted boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table wiki_pages enable row level security;

create table if not exists wiki_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid,
  title text not null default '',
  category text not null default '',
  body text not null default '',
  visibility text not null default '',
  note text not null default '',
  edited_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists wiki_revisions_page_id_idx on wiki_revisions (page_id);
alter table wiki_revisions enable row level security;

create table if not exists wiki_images (
  id uuid primary key default gen_random_uuid(),
  page_id uuid,
  file_name text not null default '',
  data_url text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists wiki_images_page_id_idx on wiki_images (page_id);
alter table wiki_images enable row level security;

create table if not exists dayoff_late_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  reason text not null default '',
  paid_leave boolean not null default false,
  status text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists dayoff_late_requests_staff_id_date_idx on dayoff_late_requests (staff_id, date);
create index if not exists dayoff_late_requests_status_idx on dayoff_late_requests (status);
alter table dayoff_late_requests enable row level security;

create table if not exists shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  break_minutes integer not null default 0,
  color text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table shift_templates enable row level security;

create table if not exists shift_staffing_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  weekday integer not null default 0,
  date text not null default '',
  required integer not null default 0,
  created_at timestamptz not null default now()
);
alter table shift_staffing_rules enable row level security;

create table if not exists shift_change_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  month text not null default '',
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  changed_by uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists shift_change_logs_date_idx on shift_change_logs (date);
alter table shift_change_logs enable row level security;

create table if not exists attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  punch_type text not null default '',
  time text not null default '',
  reason text not null default '',
  status text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists attendance_corrections_staff_id_date_idx on attendance_corrections (staff_id, date);
create index if not exists attendance_corrections_status_idx on attendance_corrections (status);
alter table attendance_corrections enable row level security;

create table if not exists register_closings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  date date,
  change_fund integer not null default 0,
  cash_sales integer not null default 0,
  denominations jsonb not null default '{}'::jsonb,
  counted_total integer not null default 0,
  expected_total integer not null default 0,
  diff integer not null default 0,
  diff_reason text not null default '',
  sales_source text not null default '',
  memo text not null default '',
  closed_by uuid,
  closed_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists register_closings_store_id_date_key on register_closings (store_id, date);
alter table register_closings enable row level security;

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  date date,
  kind text not null default '',
  direction text not null default '',
  description text not null default '',
  amount integer not null default 0,
  receipt_photo text not null default '',
  deleted boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cash_movements_store_id_date_idx on cash_movements (store_id, date);
alter table cash_movements enable row level security;

create table if not exists cash_edit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  date date,
  target_type text not null default '',
  target_id text not null default '',
  reason text not null default '',
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  edited_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cash_edit_logs_store_id_date_idx on cash_edit_logs (store_id, date);
alter table cash_edit_logs enable row level security;

create table if not exists incentive_rescues (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  month text not null default '',
  input_key text not null default '',
  date date,
  reason text not null default '',
  status text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists incentive_rescues_staff_id_month_idx on incentive_rescues (staff_id, month);
create index if not exists incentive_rescues_status_idx on incentive_rescues (status);
alter table incentive_rescues enable row level security;

create table if not exists schedule_acks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  item_type text not null default '',
  item_id text not null default '',
  version text not null default '',
  title text not null default '',
  acked_at timestamptz
);
create unique index if not exists schedule_acks_staff_id_item_type_item_id_version_key on schedule_acks (staff_id, item_type, item_id, version);
alter table schedule_acks enable row level security;

create table if not exists personal_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  start_time text not null default '',
  end_time text not null default '',
  title text not null default '',
  source_type text not null default '',
  source_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_events_staff_id_date_idx on personal_events (staff_id, date);
create index if not exists personal_events_source_type_source_id_idx on personal_events (source_type, source_id);
alter table personal_events enable row level security;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  order_url text not null default '',
  contact text not null default '',
  method text not null default '',
  deadline_note text not null default '',
  lead_days integer not null default 0,
  note text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table suppliers enable row level security;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  category text not null default '',
  brand text not null default '',
  supplier_id uuid,
  unit text not null default '',
  retail_price integer not null default 0,
  staff_price integer not null default 0,
  cost_price integer not null default 0,
  barcode text not null default '',
  reorder_point integer not null default 0,
  reorder_qty integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_supplier_id_idx on products (supplier_id);
alter table products enable row level security;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  product_id uuid,
  supplier_id uuid,
  quantity integer not null default 0,
  status text not null default '',
  ordered_by uuid,
  ordered_at timestamptz,
  received_by uuid,
  received_at timestamptz,
  received_qty integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists purchase_orders_store_id_status_idx on purchase_orders (store_id, status);
alter table purchase_orders enable row level security;

create table if not exists staff_purchases (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  store_id uuid,
  product_id uuid,
  item_name text not null default '',
  category text not null default '',
  quantity integer not null default 0,
  unit_price integer not null default 0,
  total integer not null default 0,
  purchased_on date,
  recorded_by uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists staff_purchases_staff_id_purchased_on_idx on staff_purchases (staff_id, purchased_on);
alter table staff_purchases enable row level security;

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  product_id uuid,
  kind text not null default '',
  quantity numeric not null default 0,
  occurred_on date,
  ref_type text not null default '',
  ref_id text not null default '',
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_store_id_product_id_occurred_on_idx on inventory_movements (store_id, product_id, occurred_on);
alter table inventory_movements enable row level security;

create table if not exists stocktakes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  status text not null default '',
  counted_on date,
  note text not null default '',
  started_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stocktakes_store_id_status_idx on stocktakes (store_id, status);
alter table stocktakes enable row level security;

create table if not exists stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid,
  product_id uuid,
  theoretical numeric not null default 0,
  counted numeric not null default 0,
  counted_set boolean not null default false,
  reason text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists stocktake_lines_stocktake_id_product_id_key on stocktake_lines (stocktake_id, product_id);
alter table stocktake_lines enable row level security;

create table if not exists work_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  rows jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table work_import_batches enable row level security;

create table if not exists next_request_items (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  detail text not null default '',
  source text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table next_request_items enable row level security;

create table if not exists utilization_daily (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  store_id uuid,
  brand text not null default '',
  served_minutes integer not null default 0,
  capacity_minutes integer not null default 0,
  rate numeric not null default 0,
  ahead_minutes integer not null default 0,
  over_minutes integer not null default 0,
  procedure_count integer not null default 0,
  source text not null default '',
  status text not null default '',
  note text not null default '',
  computed_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists utilization_daily_staff_id_date_key on utilization_daily (staff_id, date);
alter table utilization_daily enable row level security;

create table if not exists utilization_inputs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  date date,
  served_minutes integer not null default 0,
  break_minutes integer not null default 0,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists utilization_inputs_staff_id_date_key on utilization_inputs (staff_id, date);
alter table utilization_inputs enable row level security;

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  level text not null default '',
  store_id uuid,
  staff_id uuid,
  period_type text not null default '',
  period_key text not null default '',
  title text not null default '',
  body text not null default '',
  metric text not null default '',
  target_value numeric not null default 0,
  unit text not null default '',
  parent_id uuid,
  area text not null default '',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_level_staff_id_idx on goals (level, staff_id);
alter table goals enable row level security;

create table if not exists action_plans (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid,
  staff_id uuid,
  title text not null default '',
  task_id text not null default '',
  kind text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists action_plans_goal_id_idx on action_plans (goal_id);
alter table action_plans enable row level security;

create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  week_key date,
  done text not null default '',
  not_done text not null default '',
  next text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists reflections_staff_id_week_key_key on reflections (staff_id, week_key);
alter table reflections enable row level security;

create table if not exists goal_feedback (
  id uuid primary key default gen_random_uuid(),
  target_type text not null default '',
  target_id text not null default '',
  owner_staff_id uuid,
  from_staff_id uuid,
  body text not null default '',
  stamp text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists goal_feedback_target_type_target_id_idx on goal_feedback (target_type, target_id);
alter table goal_feedback enable row level security;

create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  scope text not null default '',
  period_key text not null default '',
  items jsonb not null default '[]'::jsonb,
  ai boolean not null default false,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_suggestions_staff_id_scope_period_key_key on ai_suggestions (staff_id, scope, period_key);
alter table ai_suggestions enable row level security;

create table if not exists growth_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  job_type text not null default '',
  sort_order integer not null default 0,
  target_month integer not null default 0,
  description text not null default '',
  competencies text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table growth_stages enable row level security;

create table if not exists curriculum_items (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid,
  title text not null default '',
  description text not null default '',
  video_id uuid,
  required_practice_minutes integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curriculum_items_stage_id_idx on curriculum_items (stage_id);
alter table curriculum_items enable row level security;

create table if not exists curriculum_results (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  item_id uuid,
  status text not null default '',
  comment text not null default '',
  judged_by uuid,
  judged_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists curriculum_results_staff_id_item_id_key on curriculum_results (staff_id, item_id);
alter table curriculum_results enable row level security;

create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  joined_on date,
  note text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_profiles_staff_id_key on staff_profiles (staff_id);
alter table staff_profiles enable row level security;

create table if not exists curriculum_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  provider text not null default '',
  provider_ref text not null default '',
  duration_sec integer not null default 0,
  status text not null default '',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table curriculum_videos enable row level security;

create table if not exists video_progress (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  video_id uuid,
  max_position_sec integer not null default 0,
  duration_sec integer not null default 0,
  completed boolean not null default false,
  last_watched_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists video_progress_staff_id_video_id_key on video_progress (staff_id, video_id);
alter table video_progress enable row level security;

create table if not exists oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null default '',
  client_name text not null default '',
  redirect_uris text[] not null default '{}',
  auth_method text not null default '',
  secret_hash text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists oauth_clients_client_id_key on oauth_clients (client_id);
alter table oauth_clients enable row level security;

create table if not exists oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null default '',
  client_id text not null default '',
  staff_id uuid,
  redirect_uri text not null default '',
  code_challenge text not null default '',
  scope text not null default '',
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists oauth_codes_code_hash_key on oauth_codes (code_hash);
alter table oauth_codes enable row level security;

create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null default '',
  kind text not null default '',
  client_id text not null default '',
  staff_id uuid,
  scope text not null default '',
  label text not null default '',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists oauth_tokens_token_hash_key on oauth_tokens (token_hash);
alter table oauth_tokens enable row level security;

create table if not exists mcp_access_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  client_name text not null default '',
  method text not null default '',
  tool text not null default '',
  args jsonb not null default '{}'::jsonb,
  ok boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mcp_access_logs_created_at_idx on mcp_access_logs (created_at);
alter table mcp_access_logs enable row level security;

create table if not exists instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  ig_user_id text not null default '',
  username text not null default '',
  account_type text not null default '',
  token_enc text not null default '',
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  status text not null default '',
  last_error text not null default '',
  connected_at timestamptz,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists instagram_accounts_staff_id_key on instagram_accounts (staff_id);
create index if not exists instagram_accounts_ig_user_id_idx on instagram_accounts (ig_user_id);
alter table instagram_accounts enable row level security;

create table if not exists instagram_daily (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  account_id uuid,
  date date,
  followers integer not null default 0,
  follows integer not null default 0,
  media_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists instagram_daily_account_id_date_key on instagram_daily (account_id, date);
alter table instagram_daily enable row level security;

create table if not exists instagram_media (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  account_id uuid,
  media_id text not null default '',
  caption text not null default '',
  media_type text not null default '',
  permalink text not null default '',
  posted_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists instagram_media_account_id_media_id_key on instagram_media (account_id, media_id);
create index if not exists instagram_media_account_id_posted_at_idx on instagram_media (account_id, posted_at);
alter table instagram_media enable row level security;

create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  applied_on date,
  source text not null default '',
  stage text not null default '',
  store_id uuid,
  status text not null default '',
  selection_ended_on date,
  decision text not null default '',
  decision_note text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table applicants enable row level security;

create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid,
  date date,
  start_time text not null default '',
  end_time text not null default '',
  place text not null default '',
  interviewer_ids text[] not null default '{}',
  status text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_applicant_id_idx on interviews (applicant_id);
alter table interviews enable row level security;

create table if not exists interview_recordings (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid,
  interview_id uuid,
  provider text not null default '',
  provider_ref text not null default '',
  file_name text not null default '',
  consent_checked boolean not null default false,
  consent_note text not null default '',
  delete_after date,
  deleted_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists interview_recordings_applicant_id_idx on interview_recordings (applicant_id);
alter table interview_recordings enable row level security;

create table if not exists interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid,
  applicant_id uuid,
  interviewer_id uuid,
  scores jsonb not null default '{}'::jsonb,
  comment text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists interview_evaluations_interview_id_interviewer_id_key on interview_evaluations (interview_id, interviewer_id);
alter table interview_evaluations enable row level security;

create table if not exists katibito_results (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid,
  interview_id uuid,
  score numeric not null default 0,
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  attachment text not null default '',
  file_name text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists katibito_results_applicant_id_idx on katibito_results (applicant_id);
alter table katibito_results enable row level security;

-- 代表だけの権限（AIしもんの相談の閲覧・教育・Claudeからの読み取り）を、代表に明示的に付けておく（1回だけ・何度流してもよい）。
-- 付けなくても、誰にも付いていない間は代表が持っている扱いになる（src/lib/permissions.ts）。
insert into staff_permissions (staff_id, permission)
select s.id, p.permission
from staff s
cross join (values ('ai_shimon_logs'), ('ai_shimon_training'), ('mcp_read')) as p(permission)
where s.is_owner and s.is_active
on conflict (staff_id, permission) do nothing;
