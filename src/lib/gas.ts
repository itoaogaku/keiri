import type { Customer, Invoice, UserRole } from '../types'

// Google Apps Script（スプレッドシートに貼るスクリプト）と通信する薄いクライアント。
// サーバー不要・鍵不要。GAS のウェブアプリ URL を設定すると同期が有効になる。
// ログイン(メール＋PIN)は GAS 側で検証し、役割に応じてデータが絞り込まれる。
//
// URL の優先順位: Vercel の環境変数 VITE_GAS_URL > 画面で設定した値(localStorage)

const LS_KEY = 'keiri.gasUrl'

export interface Auth {
  email: string
  pin: string
}

export function getGasUrl(): string {
  const env = import.meta.env.VITE_GAS_URL
  if (env) return env
  return localStorage.getItem(LS_KEY) || ''
}

export function setGasUrl(url: string): void {
  localStorage.setItem(LS_KEY, url.trim())
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
  customers?: Customer[]
  invoices?: Invoice[]
}

/** 認証付きで、権限に応じたデータを取得 */
export async function fetchState(
  url: string,
  auth: Auth
): Promise<{ customers: Customer[]; invoices: Invoice[] }> {
  const res = await post<StateResult>(url, { action: 'state', auth })
  if (res.ok === false) throw new Error(res.error || 'state failed')
  return { customers: res.customers ?? [], invoices: res.invoices ?? [] }
}

export const remote = {
  saveCustomer: (url: string, auth: Auth, customer: Customer) =>
    post(url, { action: 'upsertCustomer', auth, customer }),
  deleteCustomer: (url: string, auth: Auth, id: string) =>
    post(url, { action: 'deleteCustomer', auth, id }),
  saveInvoice: (url: string, auth: Auth, invoice: Invoice, customerName: string) =>
    post(url, { action: 'upsertInvoice', auth, invoice, customerName }),
  deleteInvoice: (url: string, auth: Auth, id: string) =>
    post(url, { action: 'deleteInvoice', auth, id }),
}
