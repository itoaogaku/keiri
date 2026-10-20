import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { knockoutBackground } from '../lib/image'
import { newId } from '../lib/invoice'
import { compactDate, toISODate, yen } from '../lib/format'
import ReceiptDocument, {
  type ReceiptData,
  type ReceiptTaxLine,
} from '../components/ReceiptDocument'
import { usePrintFilename } from '../lib/print'
import type { Honorific, Receipt, ReceiptItem } from '../types'

type RateOpt = '10' | '8' | 'exempt'

function blankReceiptItem(): ReceiptItem {
  return { id: newId(), name: '', amount: 0 }
}

export default function StandaloneReceipt() {
  const {
    data: app,
    getReceipt,
    addReceipt,
    updateReceipt,
    fetchNextReceiptNumber,
    syncEnabled,
  } = useApp()
  const print = usePrintFilename()

  // このページを開いている間、同じ領収書ドラフトのidを保つ（保存は上書き＝重複しない）
  const [receiptId] = useState(() => newId())

  const [issuerId, setIssuerId] = useState(app.issuers[0]?.id ?? '')
  const [recipient, setRecipient] = useState('')
  const [honorific, setHonorific] = useState<Honorific>('御中')
  const [receiptDate, setReceiptDate] = useState(toISODate(new Date()))
  const [receiptNo, setReceiptNo] = useState(`R-${compactDate(new Date())}-01`)
  const [items, setItems] = useState<ReceiptItem[]>(() => [blankReceiptItem()])
  const [rate, setRate] = useState<RateOpt>('10')
  const [note, setNote] = useState('お品代として')
  const [saved, setSaved] = useState(false)

  // 全領収書を対象にした次番号を取得（同期時のみ。未同期はローカル既定のまま）
  useEffect(() => {
    if (!syncEnabled) return
    let cancelled = false
    fetchNextReceiptNumber().then((num) => {
      if (!cancelled && num) setReceiptNo(num)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled])

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

  const addItem = () => setItems((list) => [...list, blankReceiptItem()])
  const removeItem = (id: string) => setItems((list) => list.filter((it) => it.id !== id))
  const updateItem = (id: string, patch: Partial<ReceiptItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  // 品目の金額（税込）を合算して内訳を算出
  const breakdown = useMemo(() => {
    const total = Math.round(items.reduce((sum, it) => sum + (it.amount || 0), 0))
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
  }, [items, rate])

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
    items,
    ...breakdown,
  }

  // 台帳（スプレッドシート）へ保存。同じidなら上書き（連打しても重複しない）
  const persist = () => {
    if (!issuer) return
    const { sealImage: _seal, ...issuerSnapshot } = issuer
    const now = new Date().toISOString()
    const payload: Receipt = {
      id: receiptId,
      receiptNo,
      receiptDate,
      recipientName: recipient,
      honorific,
      exempt: breakdown.exempt,
      subtotal: breakdown.subtotal,
      taxTotal: breakdown.taxTotal,
      total: breakdown.total,
      note,
      issuer: issuerSnapshot,
      items: items.filter((it) => it.name.trim() || it.amount !== 0),
      createdAt: getReceipt(receiptId)?.createdAt ?? now,
      updatedAt: now,
    }
    if (getReceipt(receiptId)) updateReceipt(payload)
    else addReceipt(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handlePrint = () => {
    persist()
    print(`領収書_${receiptNo}_${recipient}${honorific}`)
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div>
      <div className="no-print mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">領収書の発行（単独）</h1>
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

      {/* 入力フォーム（印刷時は非表示） */}
      <div className="no-print mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm text-slate-500">
          請求書と関係なく領収書を発行できます（グッズ販売など）。金額は税込で入力してください。
          発行した領収書はスプレッドシートの「領収書」シートに台帳として蓄積されます。
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">但し書き</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {/* 品目の内訳（品名・金額を自由に追加） */}
        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-slate-500">品目（税込金額）</label>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2">品名</th>
                  <th className="w-40 px-3 py-2 text-right">金額（税込）</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                        placeholder="例：お品代"
                        value={it.name}
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                        value={it.amount}
                        onChange={(e) => updateItem(it.id, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {items.length > 1 && (
                        <button
                          onClick={() => removeItem(it.id)}
                          className="text-slate-400 transition hover:text-red-500"
                          title="この行を削除"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={addItem}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ＋ 品目を追加
            </button>
            <div className="text-sm text-slate-600">
              合計（税込）<span className="ml-2 text-base font-semibold text-slate-800">{yen(breakdown.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <ReceiptDocument data={data} />
    </div>
  )
}
