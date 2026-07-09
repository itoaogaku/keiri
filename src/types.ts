// ===== ドメインモデル =====

/**
 * 明細の税区分。
 * - 10 / 8 : 標準10% / 軽減8%（税抜金額に消費税を加算）
 * - 0      : 税込（入力額をそのまま合計に計上。消費税を加算しない）
 */
export type TaxRate = 10 | 8 | 0

export const TAX_RATE_LABELS: Record<TaxRate, string> = {
  10: '10%',
  8: '8%',
  0: '税込',
}

/** 宛名の敬称 */
export type Honorific = '御中' | '様'

/** 請求書ステータス */
export type InvoiceStatus =
  | 'draft' // 下書き
  | 'issued' // 発行済み
  | 'awaiting_payment' // 入金待ち
  | 'paid' // 入金済み
  | 'overdue' // 延滞

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: '下書き',
  issued: '発行済み',
  awaiting_payment: '入金待ち',
  paid: '入金済み',
  overdue: '延滞',
}

/** 権限ロール */
export type UserRole = 'owner' | 'restricted'

/** ログイン中のユーザー（セッション） */
export interface Session {
  email: string
  name: string
  role: UserRole
  /** GAS へのリクエスト認証に用いる（内部利用） */
  pin: string
}

/** 顧客（請求先） */
export interface Customer {
  id: string
  companyName: string
  contactName: string
  email: string
  address: string
  phone: string
  /** 作成者メール（GASが付与。閲覧制御に使用） */
  creator?: string
}

/** 明細行 */
export interface InvoiceItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  taxRate: TaxRate
}

/**
 * 課税区分。
 * - taxable: 課税（消費税を計算・表示する）
 * - exempt : 非課税枠（消費税を計算しない。合計＝税抜金額）
 */
export type TaxMode = 'taxable' | 'exempt'

export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  taxable: '課税',
  exempt: '非課税',
}

/**
 * 請求者（請求元）プロファイル。
 * 複数の請求者を登録し、請求書ごとに使い分ける。
 */
export interface IssuerProfile {
  id: string
  /** 請求者名（例：株式会社アスリートキャリアセンター） */
  name: string
  /** 課税区分（非課税枠は消費税を計算しない） */
  taxMode: TaxMode
  /** 適格請求書発行事業者登録番号（例：T1234567890123／非課税枠は空でも可） */
  registrationNumber: string
  address: string
  tel: string
  email: string
  /** 振込先（構造化） */
  bankName: string // 銀行名
  branchName: string // 支店名
  accountType: string // 種別（普通／当座）
  accountNumber: string // 口座番号
  accountHolder: string // 口座名義
  /** 旧データ互換（1行テキストの振込先） */
  bankInfo?: string
  /** 角印画像（背景透過PNG推奨・data URL）。請求書に押印表示される */
  sealImage?: string
}

/** 請求書 */
export interface Invoice {
  id: string
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  dueDate: string // YYYY-MM-DD
  status: InvoiceStatus
  customerId: string
  /** 事業種別（売上分析用の分類。選択肢は編集可能） */
  businessType: string
  /** 宛名の敬称（御中／様。既定は御中） */
  honorific: Honorific
  /** 使用した請求者プロファイルのID */
  issuerId: string
  /** 発行時点の請求者スナップショット（後から設定変更されても過去分は不変） */
  issuer: IssuerProfile
  items: InvoiceItem[]
  notes: string
  createdAt: string
  updatedAt: string
  /** 作成者メール（GASが付与。閲覧制御に使用） */
  creator?: string
}

/** アプリ全体の永続化データ */
export interface AppData {
  customers: Customer[]
  invoices: Invoice[]
  /** 使い分け可能な請求者プロファイル一覧 */
  issuers: IssuerProfile[]
  /** 事業種別の選択肢（ユーザーが追加・削除できる） */
  businessTypes: string[]
}
