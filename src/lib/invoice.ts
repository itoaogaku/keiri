import type { Invoice, InvoiceItem, IssuerProfile } from '../types'
import { compactDate, endOfMonth, toISODate } from './format'

/** 簡易ユニークID */
export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase()
}

/**
 * 請求書番号を採番する： INV-YYYYMMDD-XXX
 * その日にすでに発行済みの番号を見て、連番(XXX)をインクリメントする。
 */
export function generateInvoiceNumber(
  invoices: Invoice[],
  base: Date = new Date()
): string {
  const datePart = compactDate(base)
  const prefix = `INV-${datePart}-`
  const seqUsed = invoices
    .filter((inv) => inv.invoiceNumber.startsWith(prefix))
    .map((inv) => parseInt(inv.invoiceNumber.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const next = (seqUsed.length ? Math.max(...seqUsed) : 0) + 1
  return prefix + String(next).padStart(3, '0')
}

function blankItem(): InvoiceItem {
  return { id: newId(), name: '', quantity: 1, unitPrice: 0, taxRate: 10 }
}

/** 空の新規請求書ドラフト（保存前・idは仮）。既定の請求者を割り当てる */
export function createBlankInvoice(
  invoices: Invoice[],
  issuer: IssuerProfile
): Invoice {
  const now = new Date()
  const nowIso = new Date().toISOString()
  return {
    id: '',
    invoiceNumber: generateInvoiceNumber(invoices, now),
    issueDate: toISODate(now),
    dueDate: endOfMonth(now),
    status: 'draft',
    customerId: '',
    issuerId: issuer.id,
    issuer: { ...issuer },
    items: [blankItem()],
    notes: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

/**
 * ★ 過去データのコピー機能のコアロジック。
 *
 * 元請求書 `src` から:
 *  - 引き継ぐ : 顧客(customerId) / 明細(品目・数量・単価・税率) / 備考 / 請求元
 *  - 再生成   : 請求書番号 / 発行日(当日) / 支払期限(当月末) / ステータス(下書き) / id
 *
 * 一覧側ではこの関数を呼ばず、URL の ?copyFrom=<id> を渡すだけにする。
 * 生成ロジックを新規作成画面に一本化でき、直リンク・リロードでも再現性がある。
 */
export function copyInvoice(
  src: Invoice,
  allInvoices: Invoice[],
  base: Date = new Date()
): Invoice {
  const nowIso = new Date().toISOString()
  return {
    id: '', // 保存時に採番
    invoiceNumber: generateInvoiceNumber(allInvoices, base), // 新規則で採番
    issueDate: toISODate(base), // 当日
    dueDate: endOfMonth(base), // 当月末
    status: 'draft', // 下書きに戻す
    customerId: src.customerId, // 顧客を引き継ぐ
    issuerId: src.issuerId, // 請求者を引き継ぐ
    issuer: { ...src.issuer }, // 請求者スナップショットを引き継ぐ
    items: src.items.map((it) => ({ ...it, id: newId() })), // 明細をディープコピー
    notes: src.notes, // 備考を引き継ぐ
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}
