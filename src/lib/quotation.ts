import type { Quotation } from '../types'
import { newId, snapshotIssuer } from './invoice'
import type { IssuerProfile, InvoiceItem } from '../types'
import { compactDate, endOfNextMonth, toISODate } from './format'

/**
 * 見積書番号を採番する： Q-YYYYMMDD-XX
 * その日にすでに発行済みの番号を見て、連番をインクリメントする。
 */
export function generateQuotationNumber(
  quotations: Quotation[],
  base: Date = new Date()
): string {
  const datePart = compactDate(base)
  const prefix = `Q-${datePart}-`
  const seqUsed = quotations
    .map((q) => String(q.quotationNumber))
    .filter((num) => num.startsWith(prefix))
    .map((num) => parseInt(num.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const next = (seqUsed.length ? Math.max(...seqUsed) : 0) + 1
  return prefix + String(next).padStart(2, '0')
}

function blankItem(): InvoiceItem {
  return { id: newId(), name: '', quantity: 1, unitPrice: 0, taxRate: 10 }
}

/** 空の新規見積書ドラフト（保存前・idは仮）。既定の請求者を割り当てる */
export function createBlankQuotation(
  quotations: Quotation[],
  issuer: IssuerProfile
): Quotation {
  const now = new Date()
  const nowIso = new Date().toISOString()
  return {
    id: '',
    quotationNumber: generateQuotationNumber(quotations, now),
    issueDate: toISODate(now),
    validUntil: endOfNextMonth(now),
    status: 'draft',
    customerId: '',
    businessType: '',
    honorific: '御中',
    issuerId: issuer.id,
    issuer: snapshotIssuer(issuer),
    items: [blankItem()],
    notes: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

/**
 * 過去の見積書からコピーして新規ドラフトを作る。
 * 引き継ぐ: 顧客・明細・備考・請求元。再生成: 見積書番号・発行日・有効期限・
 * ステータス(下書き)・id。
 */
export function copyQuotation(
  src: Quotation,
  allQuotations: Quotation[],
  base: Date = new Date()
): Quotation {
  const nowIso = new Date().toISOString()
  return {
    id: '',
    quotationNumber: generateQuotationNumber(allQuotations, base),
    issueDate: toISODate(base),
    validUntil: endOfNextMonth(base),
    status: 'draft',
    customerId: src.customerId,
    businessType: src.businessType ?? '',
    honorific: src.honorific ?? '御中',
    issuerId: src.issuerId,
    issuer: snapshotIssuer(src.issuer),
    items: src.items.map((it) => ({ ...it, id: newId() })),
    notes: src.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}
