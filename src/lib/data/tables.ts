// 追加機能（2026-11 依頼10〜23）のテーブル定義（型と列）。DBの形は supabase/schema.sql の
// 「2026-11-26 依頼10〜23」の節と1対1で対応する。既存のテーブルには列を足さない（schema.sql を流す前でも、
// 今ある機能がそのまま動くように）。足りない情報は、ここにある新しいテーブルへ別に持つ。

import { collection, defineTable, type Collection, type TableDef } from "@/lib/data/collections";

// ============================================================ 共通

/** 人ごとに付ける権限（lib/permissions.ts） */
export interface StaffPermission {
  id: string;
  staffId: string;
  permission: string;
  grantedBy: string | null;
  createdAt: Date;
}
export const staffPermissions = defineTable<StaffPermission>("staff_permissions", {
  id: "ref",
  staffId: "ref",
  permission: "text",
  grantedBy: "ref",
  createdAt: "ts",
});

/** AIを使った量（1回の呼び出し＝1行）。管理画面で月ごとに見る */
export interface AiUsageLog {
  id: string;
  feature: string;
  staffId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ok: boolean;
  note: string;
  createdAt: Date;
}
export const aiUsageLogs = defineTable<AiUsageLog>("ai_usage_logs", {
  id: "ref",
  feature: "text",
  staffId: "ref",
  model: "text",
  inputTokens: "int",
  outputTokens: "int",
  cacheReadTokens: "int",
  cacheWriteTokens: "int",
  ok: "bool",
  note: "text",
  createdAt: "ts",
});

/** AIの結果の保存（同じ質問・同じ材料なら作り直さない） */
export interface AiCacheEntry {
  id: string;
  cacheKey: string;
  feature: string;
  value: unknown;
  createdAt: Date;
}
export const aiCache = defineTable<AiCacheEntry>("ai_cache", {
  id: "ref",
  cacheKey: "text",
  feature: "text",
  value: "json",
  createdAt: "ts",
});

/** 定時実行の記録（同じ仕事を同じ回に2回しない） */
export interface JobRun {
  id: string;
  jobKey: string;
  runKey: string;
  status: string;
  detail: string;
  createdAt: Date;
}
export const jobRuns = defineTable<JobRun>("job_runs", {
  id: "ref",
  jobKey: "text",
  runKey: "text",
  status: "text",
  detail: "text",
  createdAt: "ts",
});

/** 入力した日時の記録（インセンティブの「締め日までに入力したか」に使う。依頼14） */
export interface InputSubmission {
  id: string;
  staffId: string;
  inputKey: string;
  date: string;
  firstSubmittedAt: Date;
  lastSubmittedAt: Date;
}
export const inputSubmissions = defineTable<InputSubmission>("input_submissions", {
  id: "ref",
  staffId: "ref",
  inputKey: "text",
  date: "date",
  firstSubmittedAt: "ts",
  lastSubmittedAt: "ts",
});

// ============================================================ 依頼10：社内SNS・サンクス・月間表彰

/** タイムラインの投稿（いい事例・表彰の発表） */
export interface SnsPost {
  id: string;
  kind: "case" | "award";
  authorStaffId: string;
  storeId: string | null;
  category: string;
  body: string;
  /** 写真（データURL。縮めてから保存する） */
  photos: string[];
  pinnedAt: Date | null;
  pinnedBy: string | null;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export const snsPosts = defineTable<SnsPost>("sns_posts", {
  id: "ref",
  kind: "text",
  authorStaffId: "ref",
  storeId: "ref",
  category: "text",
  body: "text",
  photos: "jsonArr",
  pinnedAt: "ts",
  pinnedBy: "ref",
  deleted: "bool",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface SnsLike {
  id: string;
  postId: string;
  staffId: string;
  createdAt: Date;
}
export const snsLikes = defineTable<SnsLike>("sns_likes", { id: "ref", postId: "ref", staffId: "ref", createdAt: "ts" });

export interface SnsComment {
  id: string;
  postId: string;
  staffId: string;
  body: string;
  deleted: boolean;
  createdAt: Date;
}
export const snsComments = defineTable<SnsComment>("sns_comments", {
  id: "ref",
  postId: "ref",
  staffId: "ref",
  body: "text",
  deleted: "bool",
  createdAt: "ts",
});

/**
 * サンクスの追加情報（スタンプ・ポイント・非公開・取り込み）。サンクス本体は今の thanks_posts のまま
 * （今のサンクスカードのデータを消さず、そのまま新しい画面に出すため）。
 */
export interface ThanksExtra {
  id: string;
  /** アプリで送ったサンクス（thanks_posts.id）。取り込んだ昔のカードは null */
  thanksId: string | null;
  fromStaffId: string | null;
  toStaffId: string | null;
  /** 取り込んだ昔のカードで、スタッフと一致しなかったときの名前 */
  fromName: string;
  toName: string;
  /** 取り込んだ昔のカードの本文（アプリで送った分は thanks_posts.body） */
  body: string;
  cardColor: string;
  stamp: string;
  points: number;
  isPrivate: boolean;
  /** 取り込んだ昔のカードの日付（"YYYY-MM-DD"。空なら送った日＝thanks_posts.created_at） */
  originalDate: string;
  source: "app" | "import";
  createdAt: Date;
}
export const thanksExtras = defineTable<ThanksExtra>("thanks_extras", {
  id: "ref",
  thanksId: "ref",
  fromStaffId: "ref",
  toStaffId: "ref",
  fromName: "text",
  toName: "text",
  body: "text",
  cardColor: "text",
  stamp: "text",
  points: "int",
  isPrivate: "bool",
  originalDate: "date",
  source: "text",
  createdAt: "ts",
});

export interface AwardCandidate {
  staffId: string;
  received: number;
  sent: number;
  pointsReceived: number;
  pointsSent: number;
}
export interface AwardWinner {
  staffId: string;
  title: string;
  comment: string;
}
/** 月間サンクス表彰（毎月1日に前月分を自動で集計 → 管理者が受賞者を選んで発表） */
export interface ThanksAward {
  id: string;
  month: string;
  status: "draft" | "announced";
  candidates: AwardCandidate[];
  winners: AwardWinner[];
  message: string;
  computedAt: Date | null;
  announcedAt: Date | null;
  announcedBy: string | null;
  postId: string | null;
  createdAt: Date;
}
export const thanksAwards = defineTable<ThanksAward>("thanks_awards", {
  id: "ref",
  month: "text",
  status: "text",
  candidates: "jsonArr",
  winners: "jsonArr",
  message: "text",
  computedAt: "ts",
  announcedAt: "ts",
  announcedBy: "ref",
  postId: "ref",
  createdAt: "ts",
});

// ============================================================ 依頼11：AIしもんの教育／ENi Wikipedia

/** AIしもんの教育（代表だけが登録・停止・並べ替え・修正できる） */
export interface AiTraining {
  id: string;
  kind: string;
  title: string;
  body: string;
  isActive: boolean;
  sortOrder: number;
  /** 相談を見ながら足したときの、元の相談（代表の画面でだけ使う。AIには渡さない） */
  sourceStaffId: string | null;
  sourceThreadId: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const aiTrainings = defineTable<AiTraining>("ai_trainings", {
  id: "ref",
  kind: "text",
  title: "text",
  body: "text",
  isActive: "bool",
  sortOrder: "int",
  sourceStaffId: "ref",
  sourceThreadId: "text",
  createdBy: "ref",
  updatedBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 教育の変更の履歴（前の状態に戻せるよう、変えた後の中身をまるごと残す） */
export interface AiTrainingRevision {
  id: string;
  trainingId: string;
  action: string;
  snapshot: Record<string, unknown>;
  editedBy: string | null;
  createdAt: Date;
}
export const aiTrainingRevisions = defineTable<AiTrainingRevision>("ai_training_revisions", {
  id: "ref",
  trainingId: "ref",
  action: "text",
  snapshot: "jsonObj",
  editedBy: "ref",
  createdAt: "ts",
});

export type WikiVisibility = "all" | "exec" | "admin";
export interface WikiPage {
  id: string;
  title: string;
  category: string;
  body: string;
  visibility: WikiVisibility;
  /** Notionから取り込んだときの元のファイル（同じページを2回取り込まないため） */
  sourcePath: string;
  deleted: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const wikiPages = defineTable<WikiPage>("wiki_pages", {
  id: "ref",
  title: "text",
  category: "text",
  body: "text",
  visibility: "text",
  sourcePath: "text",
  deleted: "bool",
  createdBy: "ref",
  updatedBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface WikiRevision {
  id: string;
  pageId: string;
  title: string;
  category: string;
  body: string;
  visibility: string;
  note: string;
  editedBy: string | null;
  createdAt: Date;
}
export const wikiRevisions = defineTable<WikiRevision>("wiki_revisions", {
  id: "ref",
  pageId: "ref",
  title: "text",
  category: "text",
  body: "text",
  visibility: "text",
  note: "text",
  editedBy: "ref",
  createdAt: "ts",
});

export interface WikiImage {
  id: string;
  pageId: string | null;
  fileName: string;
  dataUrl: string;
  createdBy: string | null;
  createdAt: Date;
}
export const wikiImages = defineTable<WikiImage>("wiki_images", {
  id: "ref",
  pageId: "ref",
  fileName: "text",
  dataUrl: "text",
  createdBy: "ref",
  createdAt: "ts",
});

// ============================================================ 依頼12：シフトと出退勤

export type Decision = "pending" | "approved" | "rejected";

/** 締切後の希望休（店長・管理者の承認制） */
export interface DayoffLateRequest {
  id: string;
  staffId: string;
  date: string;
  reason: string;
  paidLeave: boolean;
  status: Decision;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  createdAt: Date;
}
export const dayoffLateRequests = defineTable<DayoffLateRequest>("dayoff_late_requests", {
  id: "ref",
  staffId: "ref",
  date: "date",
  reason: "text",
  paidLeave: "bool",
  status: "text",
  decidedBy: "ref",
  decidedAt: "ts",
  decisionNote: "text",
  createdAt: "ts",
});

/** 勤務パターン（時間帯のひな形。シフト表のマスに当てはめる） */
export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}
export const shiftTemplates = defineTable<ShiftTemplate>("shift_templates", {
  id: "ref",
  name: "text",
  startTime: "text",
  endTime: "text",
  breakMinutes: "int",
  color: "text",
  sortOrder: "int",
  isActive: "bool",
  createdAt: "ts",
});

/** 1日ごとの必要人数（曜日ごと＝weekday 0〜6・date 空／日付ごと＝weekday -1・date あり） */
export interface ShiftStaffingRule {
  id: string;
  storeId: string;
  weekday: number;
  date: string;
  required: number;
  createdAt: Date;
}
export const shiftStaffingRules = defineTable<ShiftStaffingRule>("shift_staffing_rules", {
  id: "ref",
  storeId: "ref",
  weekday: "int",
  date: "text",
  required: "int",
  createdAt: "ts",
});

/** 公開後のシフトの変更の履歴 */
export interface ShiftChangeLog {
  id: string;
  staffId: string;
  date: string;
  month: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedBy: string | null;
  note: string;
  createdAt: Date;
}
export const shiftChangeLogs = defineTable<ShiftChangeLog>("shift_change_logs", {
  id: "ref",
  staffId: "ref",
  date: "date",
  month: "text",
  before: "jsonObj",
  after: "jsonObj",
  changedBy: "ref",
  note: "text",
  createdAt: "ts",
});

/** 打刻忘れ・打刻の修正の申請（本人が申請 → 店長・管理者が承認。承認された時刻で打刻を上書きして数える） */
export interface AttendanceCorrection {
  id: string;
  staffId: string;
  date: string;
  punchType: "in" | "out";
  time: string;
  reason: string;
  status: Decision;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  createdAt: Date;
}
export const attendanceCorrections = defineTable<AttendanceCorrection>("attendance_corrections", {
  id: "ref",
  staffId: "ref",
  date: "date",
  punchType: "text",
  time: "text",
  reason: "text",
  status: "text",
  decidedBy: "ref",
  decidedAt: "ts",
  decisionNote: "text",
  createdAt: "ts",
});

// ============================================================ 依頼13：レジ締め・現金出納帳

/** レジ締め（店舗×日で1件）。金種ごとの枚数から合計を出し、帳簿との差額を見る */
export interface RegisterClosing {
  id: string;
  storeId: string;
  date: string;
  changeFund: number;
  cashSales: number;
  /** 金種ごとの枚数（"10000" → 枚数） */
  denominations: Record<string, number>;
  countedTotal: number;
  expectedTotal: number;
  diff: number;
  diffReason: string;
  salesSource: "manual" | "salonone";
  memo: string;
  closedBy: string | null;
  closedAt: Date | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const registerClosings = defineTable<RegisterClosing>("register_closings", {
  id: "ref",
  storeId: "ref",
  date: "date",
  changeFund: "int",
  cashSales: "int",
  denominations: "jsonObj",
  countedTotal: "int",
  expectedTotal: "int",
  diff: "int",
  diffReason: "text",
  salesSource: "text",
  memo: "text",
  closedBy: "ref",
  closedAt: "ts",
  confirmedBy: "ref",
  confirmedAt: "ts",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 現金の出し入れ（経費の現金払い・両替・銀行への入金など） */
export interface CashMovement {
  id: string;
  storeId: string;
  date: string;
  kind: string;
  direction: "in" | "out" | "none";
  description: string;
  amount: number;
  receiptPhoto: string;
  deleted: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const cashMovements = defineTable<CashMovement>("cash_movements", {
  id: "ref",
  storeId: "ref",
  date: "date",
  kind: "text",
  direction: "text",
  description: "text",
  amount: "int",
  receiptPhoto: "text",
  deleted: "bool",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 確認済みの日を直したときの記録（管理者が理由を書いて直す） */
export interface CashEditLog {
  id: string;
  storeId: string;
  date: string;
  targetType: "closing" | "movement";
  targetId: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  editedBy: string | null;
  createdAt: Date;
}
export const cashEditLogs = defineTable<CashEditLog>("cash_edit_logs", {
  id: "ref",
  storeId: "ref",
  date: "date",
  targetType: "text",
  targetId: "text",
  reason: "text",
  before: "jsonObj",
  after: "jsonObj",
  editedBy: "ref",
  createdAt: "ts",
});

// ============================================================ 依頼14：必須入力・インセンティブ・予定の確認

/** 締め日のあとに入力した分の救済（理由を書いて管理者が承認すれば、インセンティブに入れる） */
export interface IncentiveRescue {
  id: string;
  staffId: string;
  month: string;
  inputKey: string;
  date: string;
  reason: string;
  status: Decision;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  createdAt: Date;
}
export const incentiveRescues = defineTable<IncentiveRescue>("incentive_rescues", {
  id: "ref",
  staffId: "ref",
  month: "text",
  inputKey: "text",
  date: "date",
  reason: "text",
  status: "text",
  decidedBy: "ref",
  decidedAt: "ts",
  decisionNote: "text",
  createdAt: "ts",
});

/** 予定の「確認しました」（誰が・いつ・どの版を確認したか） */
export interface ScheduleAck {
  id: string;
  staffId: string;
  itemType: string;
  itemId: string;
  version: string;
  title: string;
  ackedAt: Date;
}
export const scheduleAcks = defineTable<ScheduleAck>("schedule_acks", {
  id: "ref",
  staffId: "ref",
  itemType: "text",
  itemId: "text",
  version: "text",
  title: "text",
  ackedAt: "ts",
});

/** 自分の予定に入る個別の予定（面接など。依頼23） */
export interface PersonalEvent {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  sourceType: string;
  sourceId: string;
  createdAt: Date;
  updatedAt: Date;
}
export const personalEvents = defineTable<PersonalEvent>("personal_events", {
  id: "ref",
  staffId: "ref",
  date: "date",
  startTime: "text",
  endTime: "text",
  title: "text",
  sourceType: "text",
  sourceId: "text",
  createdAt: "ts",
  updatedAt: "ts",
});

// ============================================================ 依頼15：発注・購入の記録／依頼18：在庫

export interface Supplier {
  id: string;
  name: string;
  orderUrl: string;
  contact: string;
  method: string;
  deadlineNote: string;
  leadDays: number;
  note: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
export const suppliers = defineTable<Supplier>("suppliers", {
  id: "ref",
  name: "text",
  orderUrl: "text",
  contact: "text",
  method: "text",
  deadlineNote: "text",
  leadDays: "int",
  note: "text",
  isActive: "bool",
  sortOrder: "int",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 商品の一覧（依頼7の商品の一覧がまだ無いため、ここで持つ。原価は管理者だけが見る） */
export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  supplierId: string | null;
  unit: string;
  retailPrice: number;
  staffPrice: number;
  costPrice: number;
  barcode: string;
  reorderPoint: number;
  reorderQty: number;
  isActive: boolean;
  sortOrder: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}
export const products = defineTable<Product>("products", {
  id: "ref",
  name: "text",
  category: "text",
  brand: "text",
  supplierId: "ref",
  unit: "text",
  retailPrice: "int",
  staffPrice: "int",
  costPrice: "int",
  barcode: "text",
  reorderPoint: "int",
  reorderQty: "int",
  isActive: "bool",
  sortOrder: "int",
  note: "text",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface PurchaseOrder {
  id: string;
  storeId: string;
  productId: string;
  supplierId: string | null;
  quantity: number;
  status: "ordered" | "received" | "cancelled";
  orderedBy: string | null;
  orderedAt: Date | null;
  receivedBy: string | null;
  receivedAt: Date | null;
  receivedQty: number;
  note: string;
  createdAt: Date;
}
export const purchaseOrders = defineTable<PurchaseOrder>("purchase_orders", {
  id: "ref",
  storeId: "ref",
  productId: "ref",
  supplierId: "ref",
  quantity: "int",
  status: "text",
  orderedBy: "ref",
  orderedAt: "ts",
  receivedBy: "ref",
  receivedAt: "ts",
  receivedQty: "int",
  note: "text",
  createdAt: "ts",
});

/** ウィッグ・社販の購入記録（誰が・いつ・何を・いくつ・いくらで） */
export interface StaffPurchase {
  id: string;
  staffId: string;
  storeId: string | null;
  productId: string | null;
  itemName: string;
  category: "wig" | "staff_sale";
  quantity: number;
  unitPrice: number;
  total: number;
  purchasedOn: string;
  recordedBy: string | null;
  note: string;
  createdAt: Date;
}
export const staffPurchases = defineTable<StaffPurchase>("staff_purchases", {
  id: "ref",
  staffId: "ref",
  storeId: "ref",
  productId: "ref",
  itemName: "text",
  category: "text",
  quantity: "int",
  unitPrice: "int",
  total: "int",
  purchasedOn: "date",
  recordedBy: "ref",
  note: "text",
  createdAt: "ts",
});

/** 在庫の動き（入荷で増え、販売・社販・使用・廃棄で減る。棚卸しの差は adjust） */
export type InventoryKind = "receive" | "sale" | "staff_sale" | "use" | "waste" | "adjust";
export interface InventoryMovement {
  id: string;
  storeId: string;
  productId: string;
  kind: InventoryKind;
  /** 数（入荷・調整のプラスは正、減るものも正で持ち、向きは kind で決める。adjust だけは符号つき） */
  quantity: number;
  occurredOn: string;
  refType: string;
  refId: string;
  note: string;
  createdBy: string | null;
  createdAt: Date;
}
export const inventoryMovements = defineTable<InventoryMovement>("inventory_movements", {
  id: "ref",
  storeId: "ref",
  productId: "ref",
  kind: "text",
  quantity: "num",
  occurredOn: "date",
  refType: "text",
  refId: "text",
  note: "text",
  createdBy: "ref",
  createdAt: "ts",
});

export interface Stocktake {
  id: string;
  storeId: string;
  status: "draft" | "confirmed";
  countedOn: string;
  note: string;
  startedBy: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}
export const stocktakes = defineTable<Stocktake>("stocktakes", {
  id: "ref",
  storeId: "ref",
  status: "text",
  countedOn: "date",
  note: "text",
  startedBy: "ref",
  confirmedBy: "ref",
  confirmedAt: "ts",
  createdAt: "ts",
});

export interface StocktakeLine {
  id: string;
  stocktakeId: string;
  productId: string;
  theoretical: number;
  counted: number;
  /** 実際の数を入れたか（0個と「まだ数えていない」を分ける） */
  countedSet: boolean;
  reason: string;
  updatedAt: Date;
  createdAt: Date;
}
export const stocktakeLines = defineTable<StocktakeLine>("stocktake_lines", {
  id: "ref",
  stocktakeId: "ref",
  productId: "ref",
  theoretical: "num",
  counted: "num",
  countedSet: "bool",
  reason: "text",
  updatedAt: "ts",
  createdAt: "ts",
});

// ============================================================ 依頼16：業務の整理の取り込み

export interface WorkImportBatch {
  id: string;
  fileName: string;
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
  createdBy: string | null;
  appliedAt: Date | null;
  createdAt: Date;
}
export const workImportBatches = defineTable<WorkImportBatch>("work_import_batches", {
  id: "ref",
  fileName: "text",
  rows: "jsonArr",
  summary: "jsonObj",
  createdBy: "ref",
  appliedAt: "ts",
  createdAt: "ts",
});

/** 今のアプリにない機能が要る業務（作らずに「次の依頼」として残す） */
export interface NextRequestItem {
  id: string;
  title: string;
  detail: string;
  source: string;
  createdBy: string | null;
  createdAt: Date;
}
export const nextRequestItems = defineTable<NextRequestItem>("next_request_items", {
  id: "ref",
  title: "text",
  detail: "text",
  source: "text",
  createdBy: "ref",
  createdAt: "ts",
});

// ============================================================ 依頼17：稼働率

/** 人ごと・日ごとの稼働率（毎日の定期実行で作り、手で直せる） */
export interface UtilizationDaily {
  id: string;
  staffId: string;
  date: string;
  storeId: string | null;
  brand: "eni" | "eyes";
  servedMinutes: number;
  capacityMinutes: number;
  rate: number;
  aheadMinutes: number;
  overMinutes: number;
  procedureCount: number;
  source: "report" | "salonone" | "manual" | "none";
  status: "ok" | "missing" | "error" | "manual";
  note: string;
  computedAt: Date | null;
  updatedBy: string | null;
  createdAt: Date;
}
export const utilizationDaily = defineTable<UtilizationDaily>("utilization_daily", {
  id: "ref",
  staffId: "ref",
  date: "date",
  storeId: "ref",
  brand: "text",
  servedMinutes: "int",
  capacityMinutes: "int",
  rate: "num",
  aheadMinutes: "int",
  overMinutes: "int",
  procedureCount: "int",
  source: "text",
  status: "text",
  note: "text",
  computedAt: "ts",
  updatedBy: "ref",
  createdAt: "ts",
});

/** イーリスの施術時間（SalonOneから取れるまでは手で入れる） */
export interface UtilizationInput {
  id: string;
  staffId: string;
  date: string;
  servedMinutes: number;
  breakMinutes: number;
  note: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const utilizationInputs = defineTable<UtilizationInput>("utilization_inputs", {
  id: "ref",
  staffId: "ref",
  date: "date",
  servedMinutes: "int",
  breakMinutes: "int",
  note: "text",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

// ============================================================ 依頼19：目標・ピラミッド・アクションプラン

export interface Goal {
  id: string;
  level: "company" | "store" | "personal";
  storeId: string | null;
  staffId: string | null;
  periodType: "vision" | "kgi" | "year" | "month";
  periodKey: string;
  title: string;
  body: string;
  metric: string;
  targetValue: number;
  unit: string;
  parentId: string | null;
  area: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const goals = defineTable<Goal>("goals", {
  id: "ref",
  level: "text",
  storeId: "ref",
  staffId: "ref",
  periodType: "text",
  periodKey: "text",
  title: "text",
  body: "text",
  metric: "text",
  targetValue: "num",
  unit: "text",
  parentId: "ref",
  area: "text",
  isActive: "bool",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

/** アクションプラン（タスク・ルーティンとして登録し、その進み具合を目標に反映する） */
export interface ActionPlan {
  id: string;
  goalId: string;
  staffId: string;
  title: string;
  taskId: string;
  kind: "routine" | "task";
  createdBy: string | null;
  createdAt: Date;
}
export const actionPlans = defineTable<ActionPlan>("action_plans", {
  id: "ref",
  goalId: "ref",
  staffId: "ref",
  title: "text",
  taskId: "text",
  kind: "text",
  createdBy: "ref",
  createdAt: "ts",
});

/** 週の振り返り（できたこと・できなかったこと・来週やること） */
export interface Reflection {
  id: string;
  staffId: string;
  weekKey: string;
  done: string;
  notDone: string;
  next: string;
  createdAt: Date;
  updatedAt: Date;
}
export const reflections = defineTable<Reflection>("reflections", {
  id: "ref",
  staffId: "ref",
  weekKey: "date",
  done: "text",
  notDone: "text",
  next: "text",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 上の人のフィードバック（目標・アクションプラン・振り返りへのコメントやスタンプ） */
export interface GoalFeedback {
  id: string;
  targetType: "goal" | "plan" | "reflection";
  targetId: string;
  ownerStaffId: string;
  fromStaffId: string;
  body: string;
  stamp: string;
  createdAt: Date;
}
export const goalFeedback = defineTable<GoalFeedback>("goal_feedback", {
  id: "ref",
  targetType: "text",
  targetId: "text",
  ownerStaffId: "ref",
  fromStaffId: "ref",
  body: "text",
  stamp: "text",
  createdAt: "ts",
});

export interface SuggestionItem {
  text: string;
  detail: string;
  status: "pending" | "adopted" | "rejected";
  taskId: string;
}
/** AIの「今週（今月）いちばんやるべきこと」。1人1週（1月）1回だけ作って保存する */
export interface AiSuggestion {
  id: string;
  staffId: string;
  scope: "week" | "month";
  periodKey: string;
  items: SuggestionItem[];
  ai: boolean;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}
export const aiSuggestions = defineTable<AiSuggestion>("ai_suggestions", {
  id: "ref",
  staffId: "ref",
  scope: "text",
  periodKey: "text",
  items: "jsonArr",
  ai: "bool",
  model: "text",
  createdAt: "ts",
  updatedAt: "ts",
});

// ============================================================ 依頼20：カリキュラム・成長ロードマップ・動画

/** 成長の段階（コンピテンシー＝その段階で求める行動・技術／入社から何か月で） */
export interface GrowthStage {
  id: string;
  name: string;
  jobType: string;
  sortOrder: number;
  targetMonth: number;
  description: string;
  competencies: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export const growthStages = defineTable<GrowthStage>("growth_stages", {
  id: "ref",
  name: "text",
  jobType: "text",
  sortOrder: "int",
  targetMonth: "int",
  description: "text",
  competencies: "text",
  isActive: "bool",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface CurriculumItem {
  id: string;
  stageId: string;
  title: string;
  description: string;
  videoId: string | null;
  requiredPracticeMinutes: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export const curriculumItems = defineTable<CurriculumItem>("curriculum_items", {
  id: "ref",
  stageId: "ref",
  title: "text",
  description: "text",
  videoId: "ref",
  requiredPracticeMinutes: "int",
  sortOrder: "int",
  isActive: "bool",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface CurriculumResult {
  id: string;
  staffId: string;
  itemId: string;
  status: "passed" | "retry";
  comment: string;
  judgedBy: string | null;
  judgedAt: Date | null;
  createdAt: Date;
}
export const curriculumResults = defineTable<CurriculumResult>("curriculum_results", {
  id: "ref",
  staffId: "ref",
  itemId: "ref",
  status: "text",
  comment: "text",
  judgedBy: "ref",
  judgedAt: "ts",
  createdAt: "ts",
});

/** スタッフの入社日など（staff テーブルには列を足さず、ここに持つ） */
export interface StaffProfile {
  id: string;
  staffId: string;
  joinedOn: string;
  note: string;
  updatedAt: Date;
}
export const staffProfiles = defineTable<StaffProfile>("staff_profiles", {
  id: "ref",
  staffId: "ref",
  joinedOn: "date",
  note: "text",
  updatedAt: "ts",
});

export type VideoProvider = "cloudflare" | "supabase" | "url";
export interface CurriculumVideo {
  id: string;
  title: string;
  description: string;
  provider: VideoProvider;
  /** Cloudflare Stream の動画ID／Supabase Storage のパス／（試し用）動画のURL */
  providerRef: string;
  durationSec: number;
  status: "ready" | "processing" | "error";
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const curriculumVideos = defineTable<CurriculumVideo>("curriculum_videos", {
  id: "ref",
  title: "text",
  description: "text",
  provider: "text",
  providerRef: "text",
  durationSec: "int",
  status: "text",
  isActive: "bool",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

/** 誰がどの動画をどこまで見たか */
export interface VideoProgress {
  id: string;
  staffId: string;
  videoId: string;
  maxPositionSec: number;
  durationSec: number;
  completed: boolean;
  lastWatchedAt: Date | null;
  createdAt: Date;
}
export const videoProgress = defineTable<VideoProgress>("video_progress", {
  id: "ref",
  staffId: "ref",
  videoId: "ref",
  maxPositionSec: "int",
  durationSec: "int",
  completed: "bool",
  lastWatchedAt: "ts",
  createdAt: "ts",
});

// ============================================================ 依頼21：中さんのClaudeから読む（MCP）

export interface OauthClient {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  /** none（公開クライアント・PKCEのみ）／client_secret_post／client_secret_basic */
  authMethod: string;
  /** クライアントの秘密（ハッシュだけ保存） */
  secretHash: string;
  createdAt: Date;
}
export const oauthClients = defineTable<OauthClient>("oauth_clients", {
  id: "ref",
  clientId: "text",
  clientName: "text",
  redirectUris: "arr",
  authMethod: "text",
  secretHash: "text",
  createdAt: "ts",
});

export interface OauthCode {
  id: string;
  codeHash: string;
  clientId: string;
  staffId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}
export const oauthCodes = defineTable<OauthCode>("oauth_codes", {
  id: "ref",
  codeHash: "text",
  clientId: "text",
  staffId: "ref",
  redirectUri: "text",
  codeChallenge: "text",
  scope: "text",
  expiresAt: "ts",
  usedAt: "ts",
  createdAt: "ts",
});

/** アクセストークン（保存するのはハッシュだけ。kind=static はコネクタのヘッダーに入れる長い秘密のトークン） */
export interface OauthToken {
  id: string;
  tokenHash: string;
  kind: "access" | "refresh" | "static";
  clientId: string;
  staffId: string;
  scope: string;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}
export const oauthTokens = defineTable<OauthToken>("oauth_tokens", {
  id: "ref",
  tokenHash: "text",
  kind: "text",
  clientId: "text",
  staffId: "ref",
  scope: "text",
  label: "text",
  expiresAt: "ts",
  revokedAt: "ts",
  lastUsedAt: "ts",
  createdAt: "ts",
});

export interface McpAccessLog {
  id: string;
  staffId: string | null;
  clientName: string;
  method: string;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  note: string;
  createdAt: Date;
}
export const mcpAccessLogs = defineTable<McpAccessLog>("mcp_access_logs", {
  id: "ref",
  staffId: "ref",
  clientName: "text",
  method: "text",
  tool: "text",
  args: "jsonObj",
  ok: "bool",
  note: "text",
  createdAt: "ts",
});

// ============================================================ 依頼22：Instagram

export interface InstagramAccount {
  id: string;
  staffId: string;
  igUserId: string;
  username: string;
  accountType: string;
  /** アクセストークン（AUTH_SECRET から作った鍵で暗号化して保存する） */
  tokenEnc: string;
  tokenExpiresAt: Date | null;
  tokenRefreshedAt: Date | null;
  status: "active" | "expired" | "error" | "disconnected" | "demo";
  lastError: string;
  connectedAt: Date | null;
  lastFetchedAt: Date | null;
  createdAt: Date;
}
export const instagramAccounts = defineTable<InstagramAccount>("instagram_accounts", {
  id: "ref",
  staffId: "ref",
  igUserId: "text",
  username: "text",
  accountType: "text",
  tokenEnc: "text",
  tokenExpiresAt: "ts",
  tokenRefreshedAt: "ts",
  status: "text",
  lastError: "text",
  connectedAt: "ts",
  lastFetchedAt: "ts",
  createdAt: "ts",
});

export interface InstagramDaily {
  id: string;
  staffId: string;
  accountId: string;
  date: string;
  followers: number;
  follows: number;
  mediaCount: number;
  metrics: Record<string, number>;
  createdAt: Date;
}
export const instagramDaily = defineTable<InstagramDaily>("instagram_daily", {
  id: "ref",
  staffId: "ref",
  accountId: "ref",
  date: "date",
  followers: "int",
  follows: "int",
  mediaCount: "int",
  metrics: "jsonObj",
  createdAt: "ts",
});

export interface InstagramMedia {
  id: string;
  staffId: string;
  accountId: string;
  mediaId: string;
  caption: string;
  mediaType: string;
  permalink: string;
  postedAt: Date | null;
  metrics: Record<string, number>;
  fetchedAt: Date | null;
  createdAt: Date;
}
export const instagramMedia = defineTable<InstagramMedia>("instagram_media", {
  id: "ref",
  staffId: "ref",
  accountId: "ref",
  mediaId: "text",
  caption: "text",
  mediaType: "text",
  permalink: "text",
  postedAt: "ts",
  metrics: "jsonObj",
  fetchedAt: "ts",
  createdAt: "ts",
});

// ============================================================ 依頼23：面接（katibito）

export interface Applicant {
  id: string;
  name: string;
  appliedOn: string;
  source: string;
  stage: string;
  storeId: string | null;
  status: "active" | "hired" | "rejected" | "withdrawn";
  selectionEndedOn: string;
  decision: "" | "pass" | "fail" | "hold";
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const applicants = defineTable<Applicant>("applicants", {
  id: "ref",
  name: "text",
  appliedOn: "date",
  source: "text",
  stage: "text",
  storeId: "ref",
  status: "text",
  selectionEndedOn: "date",
  decision: "text",
  decisionNote: "text",
  decidedBy: "ref",
  decidedAt: "ts",
  note: "text",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface Interview {
  id: string;
  applicantId: string;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  interviewerIds: string[];
  status: "scheduled" | "done" | "cancelled";
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const interviews = defineTable<Interview>("interviews", {
  id: "ref",
  applicantId: "ref",
  date: "date",
  startTime: "text",
  endTime: "text",
  place: "text",
  interviewerIds: "arr",
  status: "text",
  createdBy: "ref",
  createdAt: "ts",
  updatedAt: "ts",
});

export interface InterviewRecording {
  id: string;
  applicantId: string;
  interviewId: string | null;
  provider: VideoProvider;
  providerRef: string;
  fileName: string;
  consentChecked: boolean;
  consentNote: string;
  /** この日を過ぎたら自動で消す（"YYYY-MM-DD"。選考が終わるまでは空） */
  deleteAfter: string;
  deletedAt: Date | null;
  uploadedBy: string | null;
  createdAt: Date;
}
export const interviewRecordings = defineTable<InterviewRecording>("interview_recordings", {
  id: "ref",
  applicantId: "ref",
  interviewId: "ref",
  provider: "text",
  providerRef: "text",
  fileName: "text",
  consentChecked: "bool",
  consentNote: "text",
  deleteAfter: "date",
  deletedAt: "ts",
  uploadedBy: "ref",
  createdAt: "ts",
});

export interface InterviewEvaluation {
  id: string;
  interviewId: string;
  applicantId: string;
  interviewerId: string;
  scores: Record<string, number>;
  comment: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const interviewEvaluations = defineTable<InterviewEvaluation>("interview_evaluations", {
  id: "ref",
  interviewId: "ref",
  applicantId: "ref",
  interviewerId: "ref",
  scores: "jsonObj",
  comment: "text",
  submittedAt: "ts",
  createdAt: "ts",
  updatedAt: "ts",
});

/** katibito（表情分析）の結果。連携の仕組みが分かるまでは手で登録する */
export interface KatibitoResult {
  id: string;
  applicantId: string;
  interviewId: string | null;
  score: number;
  summary: string;
  details: Record<string, unknown>;
  attachment: string;
  fileName: string;
  createdBy: string | null;
  createdAt: Date;
}
export const katibitoResults = defineTable<KatibitoResult>("katibito_results", {
  id: "ref",
  applicantId: "ref",
  interviewId: "ref",
  score: "num",
  summary: "text",
  details: "jsonObj",
  attachment: "text",
  fileName: "text",
  createdBy: "ref",
  createdAt: "ts",
});

// ============================================================ 入口（使う側は db.x.list() のように書く）

export const tables = {
  staffPermissions,
  aiUsageLogs,
  aiCache,
  jobRuns,
  inputSubmissions,
  snsPosts,
  snsLikes,
  snsComments,
  thanksExtras,
  thanksAwards,
  aiTrainings,
  aiTrainingRevisions,
  wikiPages,
  wikiRevisions,
  wikiImages,
  dayoffLateRequests,
  shiftTemplates,
  shiftStaffingRules,
  shiftChangeLogs,
  attendanceCorrections,
  registerClosings,
  cashMovements,
  cashEditLogs,
  incentiveRescues,
  scheduleAcks,
  personalEvents,
  suppliers,
  products,
  purchaseOrders,
  staffPurchases,
  inventoryMovements,
  stocktakes,
  stocktakeLines,
  workImportBatches,
  nextRequestItems,
  utilizationDaily,
  utilizationInputs,
  goals,
  actionPlans,
  reflections,
  goalFeedback,
  aiSuggestions,
  growthStages,
  curriculumItems,
  curriculumResults,
  staffProfiles,
  curriculumVideos,
  videoProgress,
  oauthClients,
  oauthCodes,
  oauthTokens,
  mcpAccessLogs,
  instagramAccounts,
  instagramDaily,
  instagramMedia,
  applicants,
  interviews,
  interviewRecordings,
  interviewEvaluations,
  katibitoResults,
} as const;

type TableTypes = typeof tables;
type RowOf<D> = D extends TableDef<infer T> ? T : never;
export type FeatureDb = { [K in keyof TableTypes]: Collection<RowOf<TableTypes[K]>> };

/** 追加機能のデータの入口。例：fx().snsPosts.list({ where: { deleted: false } }) */
export function fx(): FeatureDb {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(tables)) {
    out[key] = collection(def as TableDef<{ id: string }>);
  }
  return out as FeatureDb;
}
