import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals, lineNet } from '../lib/calc'
import { knockoutBackground } from '../lib/image'
import { yen, jpDate } from '../lib/format'
import { usePrintFilename } from '../lib/print'
import {
  QUOTATION_STATUS_LABELS,
  TAX_RATE_LABELS,
  type InvoiceItem,
  type IssuerProfile,
  type QuotationStatus,
} from '../types'
import QuotationStatusBadge from '../components/QuotationStatusBadge'

/** 明細の区分ラベル。立替金・「なし」区分はPDFでは無記載にする */
function itemCatLabel(it: InvoiceItem): string {
  return it.isReimbursement || it.noTaxLabel ? '' : TAX_RATE_LABELS[it.taxRate]
}

/** 振込先を1行ずつの表示用テキストに整形する（構造化 → 行配列） */
function bankLines(issuer: IssuerProfile): string[] {
  const lines: string[] = []
  if (issuer.bankName) lines.push(`銀行名：${issuer.bankName}`)
  if (issuer.branchName) lines.push(`支店名：${issuer.branchName}`)
  if (issuer.accountType) lines.push(`種類：${issuer.accountType}`)
  if (issuer.accountNumber) lines.push(`口座番号：${issuer.accountNumber}`)
  if (issuer.accountHolder) lines.push(`口座名：${issuer.accountHolder}`)
  if (lines.length === 0 && issuer.bankInfo) lines.push(issuer.bankInfo)
  return lines
}

export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, getQuotation, getCustomer, getIssuer, updateQuotation } = useApp()
  const print = usePrintFilename()

  const q = id ? getQuotation(id) : undefined
  const rawSeal = q ? getIssuer(q.issuerId)?.sealImage ?? q.issuer.sealImage : undefined

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

  if (!q) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        見積書が見つかりません。
        <div className="mt-4">
          <Link to="/quotations" className="text-brand-600 hover:underline">
            一覧へ戻る
          </Link>
        </div>
      </div>
    )
  }

  const customer = getCustomer(q.customerId)
  const t = computeTotals(q.items, q.issuer.taxMode)
  const exempt = q.issuer.taxMode === 'exempt'
  const seal = processedSeal ?? rawSeal

  const handlePrint = () => {
    const recipient = customer?.companyName ?? '提出先'
    const honorific = q.honorific ?? '御中'
    print(`見積書_${q.quotationNumber}_${recipient}${honorific}`)
  }

  return (
    <div>
      {/* 操作バー（印刷時は非表示） */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/quotations" className="text-sm text-slate-500 hover:underline">
            ← 一覧へ戻る
          </Link>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            ステータス
            <select
              value={q.status}
              onChange={(e) =>
                updateQuotation({ ...q, status: e.target.value as QuotationStatus })
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {Object.entries(QUOTATION_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            事業種別
            <select
              value={q.businessType ?? ''}
              onChange={(e) => updateQuotation({ ...q, businessType: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">— 未分類 —</option>
              {data.businessTypes.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              {q.businessType && !data.businessTypes.includes(q.businessType) && (
                <option value={q.businessType}>{q.businessType}</option>
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate(`/quotations/new?copyFrom=${q.id}`)}
            className="rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            📋 この見積書をコピー
          </button>
          <button
            onClick={() => navigate(`/quotations/${q.id}/edit`)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ✏️ 編集
          </button>
          <button
            onClick={() => navigate(`/invoices/new?fromQuotation=${q.id}`)}
            className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            📄 請求書を作成
          </button>
          <button
            onClick={handlePrint}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            ⬇ PDFダウンロード
          </button>
        </div>
      </div>

      {/* A4 見積書プレビュー */}
      <div className="print-area mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide text-slate-800">御見積書</h1>
            <div className="mt-2 text-sm text-slate-500">
              見積書番号：{q.quotationNumber}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>発行日：{jpDate(q.issueDate)}</div>
            <div className="no-print mt-2">
              <QuotationStatusBadge status={q.status} />
            </div>
          </div>
        </div>

        {/* 提出先 / 発行元 */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b-2 border-slate-800 pb-1 text-lg font-semibold text-slate-800">
              {customer?.companyName ?? '（提出先未設定）'} {q.honorific ?? '御中'}
            </div>
            {customer && (
              <div className="mt-2 text-sm text-slate-600">
                {customer.address && <div>{customer.address}</div>}
                {customer.phone && <div>{customer.phone}</div>}
              </div>
            )}
            <div className="mt-6 text-sm text-slate-600">下記の通りお見積り申し上げます。</div>
            <div className="mt-2 inline-block rounded-lg border-2 border-slate-800 px-4 py-2">
              <span className="text-sm text-slate-500">お見積り金額</span>
              <span className="ml-3 text-2xl font-bold text-slate-800">{yen(t.total)}</span>
              <span className="ml-1 text-sm text-slate-500">（税込）</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              有効期限：<span className="font-medium text-slate-800">{jpDate(q.validUntil)}</span>
            </div>
          </div>
          <div className="relative text-sm text-slate-600">
            {seal && (
              <img
                src={seal}
                alt="角印"
                className="pointer-events-none absolute right-0 top-2 h-20 w-20 object-contain"
                style={{
                  mixBlendMode: 'multiply',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              />
            )}
            <div className="font-semibold text-slate-800">{q.issuer.name}</div>
            {q.issuer.address && (
              <div className="whitespace-nowrap">{q.issuer.address}</div>
            )}
            {q.issuer.tel && <div>TEL: {q.issuer.tel}</div>}
            {q.issuer.email && <div>{q.issuer.email}</div>}
            {q.issuer.registrationNumber && (
              <div className="mt-2 text-slate-500">
                登録番号：{q.issuer.registrationNumber}
              </div>
            )}
            {exempt && <div className="mt-1 text-slate-500">※ 非課税取引</div>}
          </div>
        </div>

        {/* 明細 */}
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-slate-500">
              <th className="py-2">品目</th>
              <th className="py-2 text-right">数量</th>
              <th className="py-2 text-right">単価</th>
              <th className="py-2 text-center">区分</th>
              <th className="py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2 text-slate-800">{it.name || '—'}</td>
                <td className="py-2 text-right text-slate-600">{it.quantity.toLocaleString()}</td>
                <td className="py-2 text-right text-slate-600">{yen(it.unitPrice)}</td>
                <td className="py-2 text-center text-slate-600">{itemCatLabel(it)}</td>
                <td className="py-2 text-right font-medium text-slate-800">{yen(lineNet(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 集計 */}
        <div className="mt-6 flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>{exempt ? '合計金額（税抜）' : '小計（税抜）'}</span>
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
            {t.inclTotal > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>税込入力分</span>
                <span>{yen(t.inclTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-lg font-bold text-slate-800">
              <span>合計</span>
              <span>{yen(t.total)}</span>
            </div>
          </div>
        </div>

        {/* 備考・振込先 */}
        <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
          {bankLines(q.issuer).length > 0 && (
            <>
              <div className="font-medium text-slate-700">お振込先</div>
              {bankLines(q.issuer).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </>
          )}
          {q.notes && (
            <div className="mt-3">
              <div className="font-medium text-slate-700">備考</div>
              <div className="whitespace-pre-wrap">{q.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
