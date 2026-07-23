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

export default function ReceiptView() {
  const { id } = useParams()
  const { getInvoice, getCustomer, getIssuer } = useApp()

  const inv = id ? getInvoice(id) : undefined
  const rawSeal = inv ? getIssuer(inv.issuerId)?.sealImage ?? inv.issuer.sealImage : undefined

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

  useEffect(() => {
    if (inv && !note) {
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
        <button
          onClick={() => print(`領収書_${inv.invoiceNumber}_${recipient}${honorific}`)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ⬇ PDFダウンロード
        </button>
      </div>

      <ReceiptDocument data={data} />
    </div>
  )
}
