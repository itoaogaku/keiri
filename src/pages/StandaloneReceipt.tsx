import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { knockoutBackground } from '../lib/image'
import { compactDate, toISODate } from '../lib/format'
import ReceiptDocument, {
  type ReceiptData,
  type ReceiptTaxLine,
} from '../components/ReceiptDocument'
import { usePrintFilename } from '../lib/print'
import type { Honorific } from '../types'

type RateOpt = '10' | '8' | 'exempt'

export default function StandaloneReceipt() {
  const { data: app } = useApp()
  const print = usePrintFilename()

  const [issuerId, setIssuerId] = useState(app.issuers[0]?.id ?? '')
  const [recipient, setRecipient] = useState('')
  const [honorific, setHonorific] = useState<Honorific>('御中')
  const [receiptDate, setReceiptDate] = useState(toISODate(new Date()))
  const [receiptNo, setReceiptNo] = useState(`R-${compactDate(new Date())}-001`)
  const [amount, setAmount] = useState(0) // 税込金額
  const [rate, setRate] = useState<RateOpt>('10')
  const [note, setNote] = useState('お品代として')

  const issuer = app.issuers.find((i) => i.id === issuerId) ?? app.issuers[0]

  // 選択した請求元が非課税枠なら税率は非課税に固定
  useEffect(() => {
    if (issuer?.taxMode === 'exempt') setRate('exempt')
  }, [issuerId, issuer?.taxMode])

  // 角印を背景透過処理
  const [seal, setSeal] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const raw = issuer?.sealImage
    if (!raw) {
      setSeal(null)
      return
    }
    knockoutBackground(raw).then((out) => {
      if (!cancelled) setSeal(out)
    })
    return () => {
      cancelled = true
    }
  }, [issuer?.sealImage])

  // 税込金額から内訳を算出
  const breakdown = useMemo(() => {
    const total = Math.max(0, Math.round(amount))
    if (rate === 'exempt') {
      return { subtotal: total, taxTotal: 0, total, exempt: true, taxLines: [] as ReceiptTaxLine[] }
    }
    const r = rate === '8' ? 0.08 : 0.1
    const tax = Math.floor((total * r) / (1 + r))
    const net = total - tax
    return {
      subtotal: net,
      taxTotal: tax,
      total,
      exempt: false,
      taxLines: [{ label: `${rate}%対象`, net, tax }] as ReceiptTaxLine[],
    }
  }, [amount, rate])

  const data: ReceiptData = {
    receiptNo,
    receiptDate,
    recipientName: recipient,
    honorific,
    note,
    issuerName: issuer?.name ?? '',
    issuerAddress: issuer?.address,
    issuerTel: issuer?.tel,
    issuerRegistrationNumber: issuer?.registrationNumber,
    seal,
    ...breakdown,
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div>
      <div className="no-print mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">領収書の発行（単独）</h1>
        <button
          onClick={() => print(`領収書_${receiptNo}_${recipient}${honorific}`)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ⬇ PDFダウンロード
        </button>
      </div>

      {/* 入力フォーム（印刷時は非表示） */}
      <div className="no-print mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm text-slate-500">
          請求書と関係なく領収書を発行できます（グッズ販売など）。金額は税込で入力してください。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">請求元（発行者）</label>
            <select className={inputCls} value={issuerId} onChange={(e) => setIssuerId(e.target.value)}>
              {app.issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">領収書番号</label>
            <input className={inputCls} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">宛名</label>
            <input
              className={inputCls}
              placeholder="例：山田 太郎 / 株式会社〇〇"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">敬称</label>
            <select
              className={inputCls}
              value={honorific}
              onChange={(e) => setHonorific(e.target.value as Honorific)}
            >
              <option value="御中">御中</option>
              <option value="様">様</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">領収日</label>
            <input
              type="date"
              className={inputCls}
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">金額（税込）</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">税率</label>
              <select
                className={inputCls}
                value={rate}
                onChange={(e) => setRate(e.target.value as RateOpt)}
              >
                <option value="10">10%</option>
                <option value="8">8%</option>
                <option value="exempt">非課税</option>
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">但し書き</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>

      <ReceiptDocument data={data} />
    </div>
  )
}
