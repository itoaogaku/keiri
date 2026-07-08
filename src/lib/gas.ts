import type { Customer, Invoice } from '../types'

// Google Apps Script（スプレッドシートに貼るスクリプト）と通信する薄いクライアント。
// サーバー不要・鍵不要。GAS のウェブアプリ URL を設定すると同期が有効になる。
//
// URL の優先順位: Vercel の環境変数 VITE_GAS_URL > 画面で設定した値(localStorage)

const LS_KEY = 'keiri.gasUrl'

export function getGasUrl(): string {
  const env = import.meta.env.VITE_GAS_URL
  if (env) return env
  return localStorage.getItem(LS_KEY) || ''
}

export function setGasUrl(url: string): void {
  localStorage.setItem(LS_KEY, url.trim())
}

export async function fetchState(url: string): Promise<{
  customers: Customer[]
  invoices: Invoice[]
}> {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`GAS GET ${res.status}`)
  return res.json()
}

// POST は Content-Type を text/plain にして CORS プリフライトを避ける（GAS の定石）。
async function post(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GAS POST ${res.status}`)
  return res.json()
}

export const remote = {
  saveCustomer: (url: string, customer: Customer) =>
    post(url, { action: 'upsertCustomer', customer }),
  deleteCustomer: (url: string, id: string) =>
    post(url, { action: 'deleteCustomer', id }),
  saveInvoice: (url: string, invoice: Invoice, customerName: string) =>
    post(url, { action: 'upsertInvoice', invoice, customerName }),
  deleteInvoice: (url: string, id: string) =>
    post(url, { action: 'deleteInvoice', id }),
}
