import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals, lineNet } from '../lib/calc'
import { knockoutBackground } from '../lib/image'
import { yen, jpDate } from '../lib/format'
import {
  STATUS_LABELS,
  TAX_RATE_LABELS,
  type InvoiceItem,
  type InvoiceStatus,
  type IssuerProfile,
} from '../types'

/** 明細の区分ラベル。立替金は相手向けPDFでは無記載にする */
function itemCatLabel(it: InvoiceItem): string {
  return it.isReimbursement ? '' : TAX_RATE_LABELS[it.taxRate]
}
import StatusBadge from '../components/StatusBadge'

/** 振込先を1行ずつの表示用テキストに整形する（構造化 → 行配列） */
function bankLines(issuer: IssuerProfile): string[] {
  const lines: string[] = []
  if (issuer.bankName) lines.push(`銀行名：${issuer.bankName}`)
  if (issuer.branchName) lines.push(`支店名：${issuer.branchName}`)
  if (issuer.accountNumber) {
    lines.push(`${issuer.accountType || '普通'}：${issuer.accountNumber}`)
  } else if (issuer.accountType) {
    lines.push(issuer.accountType)
  }
  if (issuer.accountHolder) lines.push(`口座名：${issuer.accountHolder}`)
  // 旧データ（1行テキスト）しか無い場合はそれを表示
  if (lines.length === 0 && issuer.bankInfo) lines.push(issuer.bankInfo)
  return lines
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, getInvoice, getCustomer, getIssuer, updateInvoice } = useApp()

  const inv = id ? getInvoice(id) : undefined
  // 角印は請求者プロファイル（最新）から参照する（請求書には保存していない）
  const rawSeal = inv ? getIssuer(inv.issuerId)?.sealImage ?? inv.issuer.sealImage : undefined

  // 表示直前に背景を除去する（保存内容によらず、常に背景透過で表示）
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

  // PDF保存時の初期ファイル名を「請求書番号_請求先敬称」にする。
  // ブラウザは <title> を既定のファイル名に使うため、印刷直前だけ差し替える。
  const handlePrint = () => {
    const recipient = customer?.companyName ?? '請求先'
    const honorific = inv.honorific ?? '御中'
    const raw = `${inv.invoiceNumber}_${recipient}${honorific}`
    const safe = raw.replace(/[\\/:*?"<>|]/g, '_').trim()
    const prevTitle = document.title
    const restore = () => {
      document.title = prevTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    document.title = safe
    window.print()
    // afterprint が発火しない環境向けの保険
    setTimeout(restore, 1000)
  }

  return (
    <div>
      {/* 操作バー（印刷時は非表示） */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="text-sm text-slate-500 hover:underline">
            ← 一覧へ戻る
          </Link>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            ステータス
            <select
              value={inv.status}
              onChange={(e) =>
                updateInvoice({ ...inv, status: e.target.value as InvoiceStatus })
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            事業種別
            <select
              value={inv.businessType ?? ''}
              onChange={(e) => updateInvoice({ ...inv, businessType: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">— 未分類 —</option>
              {data.businessTypes.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              {inv.businessType && !data.businessTypes.includes(inv.businessType) && (
                <option value={inv.businessType}>{inv.businessType}</option>
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate(`/invoices/new?copyFrom=${inv.id}`)}
            className="rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            📋 この請求書をコピー
          </button>
          <button
            onClick={() => navigate(`/invoices/${inv.id}/edit`)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ✏️ 編集
          </button>
          <button
            onClick={handlePrint}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            ⬇ PDFダウンロード
          </button>
        </div>
      </div>

      {/* A4 請求書プレビュー */}
      <div className="print-area mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide text-slate-800">請求書</h1>
            <div className="mt-2 text-sm text-slate-500">
              請求書番号：{inv.invoiceNumber}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>発行日：{jpDate(inv.issueDate)}</div>
            <div className="no-print mt-2">
              <StatusBadge status={inv.status} />
            </div>
          </div>
        </div>

        {/* 請求先 / 請求元 */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b-2 border-slate-800 pb-1 text-lg font-semibold text-slate-800">
              {customer?.companyName ?? '（顧客未設定）'} {inv.honorific ?? '御中'}
            </div>
            {customer && (
              <div className="mt-2 text-sm text-slate-600">
                {customer.address && <div>{customer.address}</div>}
                {customer.phone && <div>{customer.phone}</div>}
              </div>
            )}
            <div className="mt-6 text-sm text-slate-600">下記の通りご請求申し上げます。</div>
            <div className="mt-2 inline-block rounded-lg border-2 border-slate-800 px-4 py-2">
              <span className="text-sm text-slate-500">ご請求金額</span>
              <span className="ml-3 text-2xl font-bold text-slate-800">{yen(t.total)}</span>
              <span className="ml-1 text-sm text-slate-500">（税込）</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              支払期限：<span className="font-medium text-slate-800">{jpDate(inv.dueDate)}</span>
            </div>
          </div>
          <div className="relative text-sm text-slate-600">
            {/* 角印。mix-blend-mode: multiply で白背景を紙に溶け込ませ、
                白背景の印鑑画像でも透過されているように見せる */}
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
            <div className="font-semibold text-slate-800">{inv.issuer.name}</div>
            {inv.issuer.address && <div className="pr-16">{inv.issuer.address}</div>}
            {inv.issuer.tel && <div>TEL: {inv.issuer.tel}</div>}
            {inv.issuer.email && <div>{inv.issuer.email}</div>}
            {inv.issuer.registrationNumber && (
              <div className="mt-2 text-slate-500">
                登録番号：{inv.issuer.registrationNumber}
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
            {inv.items.map((it) => (
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

        {/* 集計（インボイス：税率ごとの対象額・消費税額） */}
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
          <div className="font-medium text-slate-700">お振込先</div>
          {bankLines(inv.issuer).length > 0 ? (
            bankLines(inv.issuer).map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <div className="text-slate-400">（未設定）</div>
          )}
          {inv.notes && (
            <div className="mt-3">
              <div className="font-medium text-slate-700">備考</div>
              <div className="whitespace-pre-wrap">{inv.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
