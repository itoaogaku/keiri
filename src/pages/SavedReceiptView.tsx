import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { knockoutBackground } from '../lib/image'
import ReceiptDocument, { type ReceiptData } from '../components/ReceiptDocument'
import { usePrintFilename } from '../lib/print'

export default function SavedReceiptView() {
  const { id } = useParams()
  const { getReceipt, getIssuer } = useApp()
  const print = usePrintFilename()

  const r = id ? getReceipt(id) : undefined
  // 角印は現在の請求者プロファイルから参照（保存時点のスナップショットには含めない）
  const rawSeal = r ? getIssuer(r.issuer.id)?.sealImage : undefined

  const [seal, setSeal] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!rawSeal) {
      setSeal(null)
      return
    }
    knockoutBackground(rawSeal).then((out) => {
      if (!cancelled) setSeal(out)
    })
    return () => {
      cancelled = true
    }
  }, [rawSeal])

  if (!r) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        領収書が見つかりません。
        <div className="mt-4">
          <Link to="/receipts" className="text-brand-600 hover:underline">
            一覧へ戻る
          </Link>
        </div>
      </div>
    )
  }

  // 保存時点では税率区分ごとの内訳を保持していないため、合算表示にする
  const taxLines = r.exempt ? [] : [{ label: '課税対象', net: r.subtotal, tax: r.taxTotal }]

  const data: ReceiptData = {
    receiptNo: r.receiptNo,
    receiptDate: r.receiptDate,
    recipientName: r.recipientName,
    honorific: r.honorific,
    note: r.note,
    issuerName: r.issuer.name,
    issuerAddress: r.issuer.address,
    issuerTel: r.issuer.tel,
    issuerRegistrationNumber: r.issuer.registrationNumber,
    seal,
    subtotal: r.subtotal,
    taxTotal: r.taxTotal,
    total: r.total,
    exempt: r.exempt,
    taxLines,
  }

  return (
    <div>
      <div className="no-print mb-6 flex items-center justify-between">
        <Link to="/receipts" className="text-sm text-slate-500 hover:underline">
          ← 一覧へ戻る
        </Link>
        <div className="flex items-center gap-2">
          {r.invoiceId && (
            <Link
              to={`/invoices/${r.invoiceId}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              元の請求書へ
            </Link>
          )}
          <button
            onClick={() => print(`領収書_${r.receiptNo}_${r.recipientName}${r.honorific}`)}
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
