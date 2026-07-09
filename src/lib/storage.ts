import type { AppData, Customer, Invoice, IssuerProfile } from '../types'
import { newId } from './invoice'

const STORAGE_KEY = 'keiri.appdata.v2'

function makeIssuer(
  id: string,
  name: string,
  taxMode: IssuerProfile['taxMode']
): IssuerProfile {
  return {
    id,
    name,
    taxMode,
    registrationNumber: '',
    address: '',
    tel: '',
    email: '',
    bankName: '',
    branchName: '',
    accountType: '普通',
    accountNumber: '',
    accountHolder: '',
  }
}

/** 事業種別の初期候補（設定画面・請求書作成画面で追加・削除できる） */
export const DEFAULT_BUSINESS_TYPES: string[] = [
  '人材紹介',
  'コンサルティング',
  'イベント運営',
  'その他',
]

/** 使い分け可能な5つの請求者プロファイル（初期値） */
export const DEFAULT_ISSUERS: IssuerProfile[] = [
  makeIssuer('issuer-acc-kk', '株式会社アスリートキャリアセンター', 'taxable'),
  makeIssuer('issuer-acc-shadan-exempt', '一般社団法人アスリートキャリアセンター（非課税枠）', 'exempt'),
  makeIssuer('issuer-acc-shadan-taxable', '一般社団法人アスリートキャリアセンター（課税枠）', 'taxable'),
  makeIssuer('issuer-hara-ds', '株式会社原D&S', 'taxable'),
  makeIssuer('issuer-aogaku-tf', '青山学院大学陸上競技部', 'taxable'),
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
  const compact = iso(now).replace(/-/g, '')
  const dueEnd = iso(new Date(now.getFullYear(), now.getMonth() + 2, 0)) // 翌月末
  const taxableIssuer = DEFAULT_ISSUERS[0]
  const exemptIssuer = DEFAULT_ISSUERS[1]

  const invoices: Invoice[] = [
    {
      id: newId(),
      invoiceNumber: `${compact}01`,
      issueDate: iso(now),
      dueDate: dueEnd,
      status: 'issued',
      customerId: customers[0].id,
      businessType: 'コンサルティング',
      honorific: '御中',
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
      invoiceNumber: `${compact}02`,
      issueDate: iso(now),
      dueDate: dueEnd,
      status: 'paid',
      customerId: customers[1].id,
      businessType: 'その他',
      honorific: '御中',
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

  return {
    customers,
    invoices,
    issuers: DEFAULT_ISSUERS,
    businessTypes: DEFAULT_BUSINESS_TYPES,
  }
}

/** 旧データの請求者に、後から追加した振込先フィールドを補完する */
function normalizeIssuer(i: IssuerProfile): IssuerProfile {
  return {
    ...i,
    bankName: i.bankName ?? '',
    branchName: i.branchName ?? '',
    accountType: i.accountType ?? '普通',
    accountNumber: i.accountNumber ?? '',
    accountHolder: i.accountHolder ?? '',
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      // 請求者が空なら既定を補完（マイグレーション保険）
      if (!parsed.issuers || parsed.issuers.length === 0) {
        parsed.issuers = DEFAULT_ISSUERS
      } else {
        parsed.issuers = parsed.issuers.map(normalizeIssuer)
      }
      // 事業種別リストが無い旧データを補完
      if (!parsed.businessTypes) {
        parsed.businessTypes = DEFAULT_BUSINESS_TYPES
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
