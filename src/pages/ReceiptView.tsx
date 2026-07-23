import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals } from '../lib/calc'
import { knockoutBackground } from '../lib/image'
import { yen, jpDate, toISODate } from '../lib/format'

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

  // 領収日・但し書きは領収書ごとに編集可能（当日を既定）
  const [receiptDate, setReceiptDate] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')

  // 但し書きの既定値（先頭品目名から）を初期設定
  useEffect(() => {
    if (inv && !note) {
      const first = inv.items.find((it) => it.name.trim())?.name.trim()
      setNote(first ? `${first} 代として` : 'お品代として')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv])

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

  const customer = getCustomer(inv.customerId)
  const t = computeTotals(inv.items, inv.issuer.taxMode)
  const exempt = inv.issuer.taxMode === 'exempt'
  const seal = processedSeal ?? rawSeal
  const needStamp = t.total >= 50000 // 収入印紙（5万円以上）

  const handlePrint = () => {
    const recipient = customer?.companyName ?? '宛名'
    const honorific = inv.honorific ?? '御中'
    const safe = `領収書_${inv.invoiceNumber}_${recipient}${honorific}`.replace(/[\\/:*?"<>|]/g, '_')
    const prev = document.title
    const restore = () => {
      document.title = prev
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    document.title = safe
    window.print()
    setTimeout(restore, 1000)
  }

  const inputCls =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div>
      {/* 操作バー（印刷時は非表示） */}
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
            <input
              className={`${inputCls} w-56`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <button
          onClick={handlePrint}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ⬇ PDFダウンロード
        </button>
      </div>

      {/* A4 領収書プレビュー */}
      <div className="print-area mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between">
          <h1 className="text-3xl font-bold tracking-widest text-slate-800">領収書</h1>
          <div className="text-right text-sm text-slate-600">
            <div>領収日：{jpDate(receiptDate)}</div>
            <div>No. {inv.invoiceNumber}</div>
          </div>
        </div>

        {/* 宛名 */}
        <div className="mt-8 max-w-md">
          <div className="border-b-2 border-slate-800 pb-1 text-xl font-semibold text-slate-800">
            {customer?.companyName ?? '（宛名未設定）'} {inv.honorific ?? '御中'}
          </div>
        </div>

        {/* 金額 */}
        <div className="mt-8 flex items-center gap-4">
          <span className="text-lg text-slate-600">金額</span>
          <span className="rounded-lg border-2 border-slate-800 px-6 py-2 text-3xl font-bold tracking-wider text-slate-800">
            {yen(t.total)}
          </span>
          <span className="text-sm text-slate-500">（税込）</span>
        </div>

        <div className="mt-4 text-sm text-slate-700">
          但し {note}
        </div>
        <div className="mt-1 text-sm text-slate-700">上記正に領収いたしました。</div>

        {/* 内訳（インボイス：税率ごと） */}
        <div className="mt-6 flex justify-between">
          {/* 収入印紙欄 */}
          <div className="flex items-end">
            {needStamp && (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-slate-400 text-center text-xs text-slate-400">
                収入印紙
              </div>
            )}
          </div>

          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>{exempt ? '税抜金額' : '小計（税抜）'}</span>
              <span>{yen(t.subtotal)}</span>
            </div>
            {exempt ? (
              <div className="flex justify-between text-slate-500">
                <span>消費税</span>
                <span>非課税</span>
              </div>
            ) : (
              <>
                {t.netByRate[10] > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>10%対象 {yen(t.netByRate[10])}</span>
                    <span>消費税 {yen(t.taxByRate[10])}</span>
                  </div>
                )}
                {t.netByRate[8] > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>8%対象 {yen(t.netByRate[8])}</span>
                    <span>消費税 {yen(t.taxByRate[8])}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>消費税合計</span>
                  <span>{yen(t.taxTotal)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold text-slate-800">
              <span>合計</span>
              <span>{yen(t.total)}</span>
            </div>
          </div>
        </div>

        {/* 請求元（発行者） */}
        <div className="mt-10 flex justify-end">
          <div className="relative text-sm text-slate-600">
            {seal && (
              <img
                src={seal}
                alt="角印"
                className="pointer-events-none absolute right-0 top-2 h-20 w-20 object-contain"
                style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
              />
            )}
            <div className="font-semibold text-slate-800">{inv.issuer.name}</div>
            {inv.issuer.address && <div className="whitespace-nowrap">{inv.issuer.address}</div>}
            {inv.issuer.tel && <div>TEL: {inv.issuer.tel}</div>}
            {inv.issuer.registrationNumber && (
              <div className="mt-2 text-slate-500">登録番号：{inv.issuer.registrationNumber}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
