import type { AppData, Customer, Invoice, IssuerProfile } from '../types'
import { newId } from './invoice'

const STORAGE_KEY = 'keiri.appdata.v2'

/** 使い分け可能な5つの請求者プロファイル（初期値） */
export const DEFAULT_ISSUERS: IssuerProfile[] = [
  {
    id: 'issuer-acc-kk',
    name: '株式会社アスリートキャリアセンター',
    taxMode: 'taxable',
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankInfo: '',
  },
  {
    id: 'issuer-acc-shadan-exempt',
    name: '一般社団法人アスリートキャリアセンター（非課税枠）',
    taxMode: 'exempt',
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankInfo: '',
  },
  {
    id: 'issuer-acc-shadan-taxable',
    name: '一般社団法人アスリートキャリアセンター（課税枠）',
    taxMode: 'taxable',
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankInfo: '',
  },
  {
    id: 'issuer-hara-ds',
    name: '株式会社原D&S',
    taxMode: 'taxable',
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankInfo: '',
  },
  {
    id: 'issuer-aogaku-tf',
    name: '青山学院大学陸上競技部',
    taxMode: 'taxable',
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankInfo: '',
  },
]

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
  const dueEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const taxableIssuer = DEFAULT_ISSUERS[0]
  const exemptIssuer = DEFAULT_ISSUERS[1]

  const invoices: Invoice[] = [
    {
      id: newId(),
      invoiceNumber: `INV-${iso(now).replace(/-/g, '')}-001`,
      issueDate: iso(now),
      dueDate: dueEnd,
      status: 'issued',
      customerId: customers[0].id,
      issuerId: taxableIssuer.id,
      issuer: { ...taxableIssuer },
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
      dueDate: dueEnd,
      status: 'paid',
      customerId: customers[1].id,
      issuerId: exemptIssuer.id,
      issuer: { ...exemptIssuer },
      items: [
        { id: newId(), name: '講演料（非課税）', quantity: 1, unitPrice: 150000, taxRate: 10 },
      ],
      notes: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ]

  return { customers, invoices, issuers: DEFAULT_ISSUERS }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      // 請求者が空なら既定を補完（マイグレーション保険）
      if (!parsed.issuers || parsed.issuers.length === 0) {
        parsed.issuers = DEFAULT_ISSUERS
      }
      return parsed
    }
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
