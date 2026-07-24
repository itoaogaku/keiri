import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals } from '../lib/calc'
import { knockoutBackground } from '../lib/image'
import { toISODate } from '../lib/format'
import ReceiptDocument, {
  type ReceiptData,
  type ReceiptTaxLine,
} from '../components/ReceiptDocument'
import { usePrintFilename } from '../lib/print'
import type { Receipt } from '../types'

export default function ReceiptView() {
  const { id } = useParams()
  const { getInvoice, getCustomer, getIssuer, getReceipt, addReceipt, updateReceipt } = useApp()

  const inv = id ? getInvoice(id) : undefined
  const rawSeal = inv ? getIssuer(inv.issuerId)?.sealImage ?? inv.issuer.sealImage : undefined

  // 請求書1件につき領収書は1件に保つ（idを請求書idから決定的に生成。再発行は上書き）
  const receiptId = inv ? `receipt-${inv.id}` : ''

  const [processedSeal, setProcessedSeal] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!rawSeal) {
      setProcessedSeal(null)
      return
    }
    knockoutBackground(rawSeal).then((out) => {
      if (!cancelled) setProcessedSeal(out)
    })
    return () => {
      cancelled = true
    }
  }, [rawSeal])

  const [receiptDate, setReceiptDate] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (inv && !note) {
      const existing = getReceipt(receiptId)
      if (existing) {
        setNote(existing.note)
        setReceiptDate(existing.receiptDate)
        return
      }
      const first = inv.items.find((it) => it.name.trim())?.name.trim()
      setNote(first ? `${first} 代として` : 'お品代として')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv])

  const customer = inv ? getCustomer(inv.customerId) : undefined
  const print = usePrintFilename()

  if (!inv) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        請求書が見つかりません。
        <div className="mt-4">
          <Link to="/invoices" className="text-brand-600 hover:underline">
            一覧へ戻る
          </Link>
        </div>
      </div>
    )
  }

  const t = computeTotals(inv.items, inv.issuer.taxMode)
  const exempt = inv.issuer.taxMode === 'exempt'
  const taxLines: ReceiptTaxLine[] = []
  if (!exempt) {
    if (t.netByRate[10] > 0) taxLines.push({ label: '10%対象', net: t.netByRate[10], tax: t.taxByRate[10] })
    if (t.netByRate[8] > 0) taxLines.push({ label: '8%対象', net: t.netByRate[8], tax: t.taxByRate[8] })
  }

  const recipient = customer?.companyName ?? ''
  const honorific = inv.honorific ?? '御中'

  const data: ReceiptData = {
    receiptNo: inv.invoiceNumber,
    receiptDate,
    recipientName: recipient,
    honorific,
    note,
    issuerName: inv.issuer.name,
    issuerAddress: inv.issuer.address,
    issuerTel: inv.issuer.tel,
    issuerRegistrationNumber: inv.issuer.registrationNumber,
    seal: processedSeal ?? rawSeal,
    subtotal: t.subtotal,
    taxTotal: t.taxTotal,
    total: t.total,
    exempt,
    taxLines,
  }

  // 台帳（スプレッドシート）へ保存。id固定なので再発行は上書き
  const persist = () => {
    const { sealImage: _seal, ...issuerSnapshot } = inv.issuer
    const now = new Date().toISOString()
    const existing = getReceipt(receiptId)
    const payload: Receipt = {
      id: receiptId,
      receiptNo: inv.invoiceNumber,
      receiptDate,
      recipientName: recipient,
      honorific,
      exempt,
      subtotal: t.subtotal,
      taxTotal: t.taxTotal,
      total: t.total,
      note,
      issuer: issuerSnapshot,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) updateReceipt(payload)
    else addReceipt(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handlePrint = () => {
    persist()
    print(`領収書_${inv.invoiceNumber}_${recipient}${honorific}`)
  }

  const inputCls =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/invoices/${inv.id}`} className="text-sm text-slate-500 hover:underline">
            ← 請求書へ戻る
          </Link>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            領収日
            <input
              type="date"
              className={inputCls}
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            但し書き
            <input className={`${inputCls} w-56`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600">✓ 台帳に保存しました</span>}
          <button
            onClick={persist}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            台帳に保存
          </button>
          <button
            onClick={handlePrint}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            ⬇ PDFダウンロード
          </button>
        </div>
      </div>

      <ReceiptDocument data={data} />
    </div>
  )
}
