import type { AppData, Customer, Invoice, IssuerInfo } from '../types'
import { newId } from './invoice'

const STORAGE_KEY = 'keiri.appdata.v1'

const DEFAULT_ISSUER: IssuerInfo = {
  companyName: '株式会社サンプル商事',
  registrationNumber: 'T1234567890123',
  address: '東京都千代田区丸の内1-1-1',
  tel: '03-1234-5678',
  email: 'info@example.co.jp',
  bankInfo: '〇〇銀行 丸の内支店 普通 1234567',
}

/** 初回起動時のデモデータ */
function seedData(): AppData {
  const customers: Customer[] = [
    {
      id: newId(),
      companyName: '株式会社ABC工業',
      contactName: '田中 太郎',
      email: 'tanaka@abc.example.com',
      address: '大阪府大阪市北区梅田2-2-2',
      phone: '06-1111-2222',
    },
    {
      id: newId(),
      companyName: 'グローバルテック株式会社',
      contactName: '佐藤 花子',
      email: 'sato@globaltech.example.com',
      address: '神奈川県横浜市西区みなとみらい3-3-3',
      phone: '045-3333-4444',
    },
  ]

  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const invoices: Invoice[] = [
    {
      id: newId(),
      invoiceNumber: `INV-${iso(now).replace(/-/g, '')}-001`,
      issueDate: iso(now),
      dueDate: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      status: 'issued',
      customerId: customers[0].id,
      issuer: { ...DEFAULT_ISSUER },
      items: [
        { id: newId(), name: 'Webサイト制作費', quantity: 1, unitPrice: 300000, taxRate: 10 },
        { id: newId(), name: '保守サポート（月額）', quantity: 3, unitPrice: 20000, taxRate: 10 },
      ],
      notes: '毎度お世話になっております。',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: newId(),
      invoiceNumber: `INV-${iso(now).replace(/-/g, '')}-002`,
      issueDate: iso(now),
      dueDate: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      status: 'paid',
      customerId: customers[1].id,
      issuer: { ...DEFAULT_ISSUER },
      items: [
        { id: newId(), name: 'コンサルティング料', quantity: 10, unitPrice: 15000, taxRate: 10 },
        { id: newId(), name: '資料印刷代（軽減税率）', quantity: 100, unitPrice: 200, taxRate: 8 },
      ],
      notes: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ]

  return { customers, invoices, issuer: DEFAULT_ISSUER }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppData
  } catch {
    // 壊れたデータは無視して再シード
  }
  const seeded = seedData()
  saveData(seeded)
  return seeded
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
