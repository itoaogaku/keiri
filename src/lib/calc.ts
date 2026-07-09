import type { InvoiceItem, TaxMode, TaxRate } from '../types'

/** 明細行の金額（数量×単価） */
export function lineNet(item: InvoiceItem): number {
  return Math.round(item.quantity * item.unitPrice)
}

export interface TaxBreakdown {
  /** 税率ごとの税抜対象額（10% / 8%） */
  netByRate: Record<TaxRate, number>
  /** 税率ごとの消費税額 */
  taxByRate: Record<TaxRate, number>
  /** 税抜合計（10%・8%対象の税抜） */
  subtotal: number
  /** 消費税合計 */
  taxTotal: number
  /** 税込入力ぶんの合計（消費税を加算しない） */
  inclTotal: number
  /** 総合計 */
  total: number
}

/**
 * インボイス制度対応の集計。
 * 税率（8% / 10%）ごとに対象額と消費税額を分けて集計し、
 * 端数は税率区分ごとに1回だけ丸める（適格請求書の要件）。
 *
 * 税区分 0（税込）の明細は、入力額をそのまま総合計へ計上し消費税を加算しない。
 * taxMode='exempt'（非課税枠）の請求者では消費税を一切計算しない。
 */
export function computeTotals(
  items: InvoiceItem[],
  taxMode: TaxMode = 'taxable'
): TaxBreakdown {
  const netByRate: Record<TaxRate, number> = { 10: 0, 8: 0, 0: 0 }
  let inclTotal = 0

  for (const item of items) {
    if (item.taxRate === 0) {
      inclTotal += lineNet(item)
    } else {
      netByRate[item.taxRate] += lineNet(item)
    }
  }

  const exempt = taxMode === 'exempt'
  const taxByRate: Record<TaxRate, number> = {
    10: exempt ? 0 : Math.floor(netByRate[10] * 0.1),
    8: exempt ? 0 : Math.floor(netByRate[8] * 0.08),
    0: 0,
  }

  const subtotal = netByRate[8] + netByRate[10]
  const taxTotal = taxByRate[8] + taxByRate[10]

  return {
    netByRate,
    taxByRate,
    subtotal,
    taxTotal,
    inclTotal,
    total: subtotal + taxTotal + inclTotal,
  }
}
