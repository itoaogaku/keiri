import type { InvoiceItem, TaxRate } from '../types'

/** 明細行の税抜金額 */
export function lineNet(item: InvoiceItem): number {
  return Math.round(item.quantity * item.unitPrice)
}

export interface TaxBreakdown {
  /** 税率ごとの税抜対象額 */
  netByRate: Record<TaxRate, number>
  /** 税率ごとの消費税額 */
  taxByRate: Record<TaxRate, number>
  /** 税抜合計 */
  subtotal: number
  /** 消費税合計 */
  taxTotal: number
  /** 税込合計 */
  total: number
}

/**
 * インボイス制度対応の集計。
 * 税率（8% / 10%）ごとに対象額と消費税額を分けて集計し、
 * 端数は税率区分ごとに1回だけ丸める（適格請求書の要件）。
 */
export function computeTotals(items: InvoiceItem[]): TaxBreakdown {
  const netByRate: Record<TaxRate, number> = { 8: 0, 10: 0 }

  for (const item of items) {
    netByRate[item.taxRate] += lineNet(item)
  }

  const taxByRate: Record<TaxRate, number> = {
    8: Math.floor(netByRate[8] * 0.08),
    10: Math.floor(netByRate[10] * 0.1),
  }

  const subtotal = netByRate[8] + netByRate[10]
  const taxTotal = taxByRate[8] + taxByRate[10]

  return {
    netByRate,
    taxByRate,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
  }
}
