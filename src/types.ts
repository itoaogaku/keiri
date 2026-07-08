// ===== ドメインモデル =====

/** 消費税率（インボイス制度対応：軽減8% / 標準10%） */
export type TaxRate = 8 | 10

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

/** 顧客（請求先） */
export interface Customer {
  id: string
  companyName: string
  contactName: string
  email: string
  address: string
  phone: string
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
  /** 振込先など */
  bankInfo: string
}

/** 請求書 */
export interface Invoice {
  id: string
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  dueDate: string // YYYY-MM-DD
  status: InvoiceStatus
  customerId: string
  /** 使用した請求者プロファイルのID */
  issuerId: string
  /** 発行時点の請求者スナップショット（後から設定変更されても過去分は不変） */
  issuer: IssuerProfile
  items: InvoiceItem[]
  notes: string
  createdAt: string
  updatedAt: string
}

/** アプリ全体の永続化データ */
export interface AppData {
  customers: Customer[]
  invoices: Invoice[]
  /** 使い分け可能な請求者プロファイル一覧 */
  issuers: IssuerProfile[]
}
