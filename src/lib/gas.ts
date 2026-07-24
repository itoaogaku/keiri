import type { Customer, Invoice, IssuerProfile, Receipt, UserRole } from '../types'

// Google Apps Script（スプレッドシートに貼るスクリプト）と通信する薄いクライアント。
// サーバー不要・鍵不要。GAS のウェブアプリ URL を設定すると同期が有効になる。
// ログイン(メール＋PIN)は GAS 側で検証し、役割に応じてデータが絞り込まれる。
//
// URL の優先順位: Vercel の環境変数 VITE_GAS_URL > 画面で設定した値(localStorage)

const LS_KEY = 'keiri.gasUrl'
// 「ローカルに戻す」で明示的にローカル動作を選んだことを表す番兵値
const LOCAL_SENTINEL = '__local__'

// 本番ビルドの既定接続先（未設定でも社員がログイン必須になるように）。
// ※このURLは PIN 認証で保護されており、URL 単体ではデータにアクセスできません。
const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbxr04LIgvF-WcKUfh8L0dfKcIcN2e2RmuipCiecmmBDNIoaGQISyM3DG75O2EKXX2XQZA/exec'

export interface Auth {
  email: string
  pin: string
}

/**
 * 接続先URLの解決順:
 *   1) 明示的にローカル指定(__local__) → ''（ローカル動作）
 *   2) ユーザーが画面で保存したURL(localStorage)
 *   3) ビルド時の環境変数 VITE_GAS_URL
 *   4) 本番ビルドの既定URL（開発時は空）
 */
export function getGasUrl(): string {
  const stored = localStorage.getItem(LS_KEY)
  if (stored === LOCAL_SENTINEL) return ''
  if (stored) return stored
  const env = import.meta.env.VITE_GAS_URL
  if (env) return env
  return import.meta.env.PROD ? DEFAULT_GAS_URL : ''
}

export function setGasUrl(url: string): void {
  // 空文字＝ローカルに戻す。番兵値で保存し、既定URLへ再フォールバックしないようにする
  localStorage.setItem(LS_KEY, url.trim() || LOCAL_SENTINEL)
}

// POST は Content-Type を text/plain にして CORS プリフライトを避ける（GAS の定石）。
async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GAS POST ${res.status}`)
  return res.json() as Promise<T>
}

interface LoginResult {
  ok: boolean
  user?: { email: string; name: string; role: UserRole }
  error?: string
}

/** ログイン（メール＋PINを GAS で検証） */
export async function login(
  url: string,
  email: string,
  pin: string
): Promise<LoginResult> {
  return post<LoginResult>(url, { action: 'login', email, pin })
}

interface StateResult {
  ok?: boolean
  error?: string
  customers?: unknown[]
  invoices?: unknown[]
  receipts?: unknown[]
  issuers?: IssuerProfile[]
  businessTypes?: string[]
}

// ---- 型の正規化 ----
// スプレッドシートは "2026070901" のような値を数値として返すことがあるため、
// アプリが期待する型（文字列・数値）へ明示的に変換して事故を防ぐ。
const str = (v: unknown): string => (v == null ? '' : String(v))
const numOr = (v: unknown, d = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
/** 日付を YYYY-MM-DD に正規化（ISO日時が来ても日付部分を取り出す） */
const dateStr = (v: unknown): string => {
  const s = str(v)
  const m = s.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : s
}

function normItem(it: Record<string, unknown>): Record<string, unknown> {
  const rate = numOr(it.taxRate, 10)
  return {
    id: str(it.id) || Math.random().toString(36).slice(2, 8),
    name: str(it.name),
    quantity: numOr(it.quantity),
    unitPrice: numOr(it.unitPrice),
    taxRate: rate === 0 || rate === 8 || rate === 10 ? rate : 10,
    isReimbursement: Boolean(it.isReimbursement),
  }
}

function normCustomer(c: Record<string, unknown>): Customer {
  return {
    id: str(c.id),
    companyName: str(c.companyName),
    contactName: str(c.contactName),
    email: str(c.email),
    address: str(c.address),
    phone: str(c.phone),
    creator: str(c.creator),
  }
}

function normInvoice(inv: Record<string, unknown>): Invoice {
  const issuer = (inv.issuer && typeof inv.issuer === 'object' ? inv.issuer : {}) as Record<string, unknown>
  const items = Array.isArray(inv.items) ? inv.items : []
  return {
    id: str(inv.id),
    invoiceNumber: str(inv.invoiceNumber),
    issueDate: dateStr(inv.issueDate),
    dueDate: dateStr(inv.dueDate),
    status: (str(inv.status) || 'draft') as Invoice['status'],
    customerId: str(inv.customerId),
    businessType: str(inv.businessType),
    honorific: inv.honorific === '様' ? '様' : '御中',
    issuerId: str(inv.issuerId),
    issuer: {
      ...(issuer as object),
      id: str(issuer.id),
      name: str(issuer.name),
      taxMode: issuer.taxMode === 'exempt' ? 'exempt' : 'taxable',
    } as Invoice['issuer'],
    items: items.map((it) => normItem(it as Record<string, unknown>)) as unknown as Invoice['items'],
    notes: str(inv.notes),
    createdAt: str(inv.createdAt),
    updatedAt: str(inv.updatedAt),
    creator: str(inv.creator),
  }
}

function normReceipt(r: Record<string, unknown>): Receipt {
  const issuer = (r.issuer && typeof r.issuer === 'object' ? r.issuer : {}) as Record<string, unknown>
  return {
    id: str(r.id),
    receiptNo: str(r.receiptNo),
    receiptDate: dateStr(r.receiptDate),
    recipientName: str(r.recipientName),
    honorific: r.honorific === '様' ? '様' : '御中',
    exempt: Boolean(r.exempt),
    subtotal: numOr(r.subtotal),
    taxTotal: numOr(r.taxTotal),
    total: numOr(r.total),
    note: str(r.note),
    issuer: {
      ...(issuer as object),
      id: str(issuer.id),
      name: str(issuer.name),
      taxMode: issuer.taxMode === 'exempt' ? 'exempt' : 'taxable',
    } as Receipt['issuer'],
    invoiceId: str(r.invoiceId),
    invoiceNumber: str(r.invoiceNumber),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    creator: str(r.creator),
  }
}

/** 認証付きで、権限に応じたデータ＋共有設定を取得 */
export async function fetchState(
  url: string,
  auth: Auth
): Promise<{
  customers: Customer[]
  invoices: Invoice[]
  receipts: Receipt[]
  issuers: IssuerProfile[]
  businessTypes: string[]
}> {
  const res = await post<StateResult>(url, { action: 'state', auth })
  if (res.ok === false) throw new Error(res.error || 'state failed')
  return {
    customers: (res.customers ?? []).map((c) => normCustomer(c as Record<string, unknown>)),
    invoices: (res.invoices ?? []).map((i) => normInvoice(i as Record<string, unknown>)),
    receipts: (res.receipts ?? []).map((r) => normReceipt(r as Record<string, unknown>)),
    issuers: Array.isArray(res.issuers) ? res.issuers : [],
    businessTypes: Array.isArray(res.businessTypes) ? res.businessTypes : [],
  }
}

/** 共有設定（請求者・事業種別）を保存（オーナーのみ・GASで検証） */
export async function saveConfig(
  url: string,
  auth: Auth,
  config: { issuers: IssuerProfile[]; businessTypes: string[] }
): Promise<unknown> {
  return post(url, { action: 'saveConfig', auth, config })
}

/** 全請求書を対象に、指定日の次の請求書番号を採番 */
export async function nextInvoiceNumber(
  url: string,
  auth: Auth,
  datePart: string
): Promise<string | null> {
  const res = await post<{ ok?: boolean; invoiceNumber?: string }>(url, {
    action: 'nextInvoiceNumber',
    auth,
    datePart,
  })
  return res.invoiceNumber ?? null
}

/** 全領収書を対象に、指定日の次の領収書番号を採番（R-YYYYMMDD-XX） */
export async function nextReceiptNumber(
  url: string,
  auth: Auth,
  datePart: string
): Promise<string | null> {
  const res = await post<{ ok?: boolean; receiptNumber?: string }>(url, {
    action: 'nextReceiptNumber',
    auth,
    datePart,
  })
  return res.receiptNumber ?? null
}

/**
 * 重複顧客（企業名が同じ）を1件に統合する（オーナーのみ）。
 * 戻り値は統合（削除）した件数。
 */
export async function mergeCustomers(url: string, auth: Auth): Promise<number> {
  const res = await post<{ ok?: boolean; merged?: number; error?: string }>(url, {
    action: 'mergeCustomers',
    auth,
  })
  if (res.ok === false) throw new Error(res.error || 'merge failed')
  return res.merged ?? 0
}

export const remote = {
  // 顧客は共有台帳。企業名が既存と一致する場合、GASはその既存idへ統合して
  // 書き込むため、実際に保存されたid（呼び出し時と異なる場合がある）を返す。
  saveCustomer: (url: string, auth: Auth, customer: Customer) =>
    post<{ ok?: boolean; id?: string }>(url, { action: 'upsertCustomer', auth, customer }),
  deleteCustomer: (url: string, auth: Auth, id: string) =>
    post(url, { action: 'deleteCustomer', auth, id }),
  saveInvoice: (url: string, auth: Auth, invoice: Invoice, customerName: string) =>
    post(url, { action: 'upsertInvoice', auth, invoice, customerName }),
  deleteInvoice: (url: string, auth: Auth, id: string) =>
    post(url, { action: 'deleteInvoice', auth, id }),
  saveReceipt: (url: string, auth: Auth, receipt: Receipt) =>
    post(url, { action: 'upsertReceipt', auth, receipt }),
  deleteReceipt: (url: string, auth: Auth, id: string) =>
    post(url, { action: 'deleteReceipt', auth, id }),
}
