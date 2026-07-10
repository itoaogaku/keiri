import type { AppData, IssuerProfile } from '../types'

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

/**
 * 初期データ。顧客・請求書は空（サンプルは入れない）。
 * 実データはログイン後にスプレッドシートから取得する。
 * 請求者プロファイルと事業種別は設定として初期値を持たせる。
 */
function seedData(): AppData {
  return {
    customers: [],
    invoices: [],
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
