import type { Customer, Invoice } from '../types'

// バックエンド（/api）経由で Notion と同期する薄いクライアント。
// サーバーが無い / Notion 未設定なら enabled=false になり、
// 呼び出し元は localStorage のみで動作する。

const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

/** Notion 連携が有効かを判定（サーバー未起動なら false） */
export async function checkNotion(): Promise<boolean> {
  try {
    const h = await req<{ notion: boolean }>('/health')
    return Boolean(h.notion)
  } catch {
    return false
  }
}

export async function fetchState(): Promise<{
  customers: Customer[]
  invoices: Invoice[]
}> {
  return req('/state')
}

export const remote = {
  saveCustomer: (c: Customer) =>
    req(`/customers/${encodeURIComponent(c.id)}`, {
      method: 'PUT',
      body: JSON.stringify(c),
    }),
  deleteCustomer: (id: string) =>
    req(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveInvoice: (invoice: Invoice, customerName: string) =>
    req(`/invoices/${encodeURIComponent(invoice.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ invoice, customerName }),
    }),
  deleteInvoice: (id: string) =>
    req(`/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
