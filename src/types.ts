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

/** 請求元（自社）情報 — 設定画面で編集 */
export interface IssuerInfo {
  companyName: string
  /** 適格請求書発行事業者登録番号（例：T1234567890123） */
  registrationNumber: string
  address: string
  tel: string
  email: string
  /** 振込先など備考 */
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
  /** 発行時点の請求元スナップショット（後から設定変更されても過去分は不変） */
  issuer: IssuerInfo
  items: InvoiceItem[]
  notes: string
  createdAt: string
  updatedAt: string
}

/** アプリ全体の永続化データ */
export interface AppData {
  customers: Customer[]
  invoices: Invoice[]
  issuer: IssuerInfo
}
