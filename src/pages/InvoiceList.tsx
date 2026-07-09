import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals } from '../lib/calc'
import { yen, jpDate } from '../lib/format'
import { STATUS_LABELS, type Invoice, type InvoiceStatus } from '../types'
import StatusBadge from '../components/StatusBadge'

type SortKey = 'issueDate' | 'total' | 'invoiceNumber'

export default function InvoiceList() {
  const { data, getCustomer, deleteInvoice } = useApp()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [bizFilter, setBizFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('issueDate')
  const [sortAsc, setSortAsc] = useState(false)

  const totalOf = (inv: Invoice) => computeTotals(inv.items, inv.issuer.taxMode).total

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = data.invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (bizFilter !== 'all') {
        const b = inv.businessType || ''
        if (bizFilter === '__none__' ? b !== '' : b !== bizFilter) return false
      }
      if (!q) return true
      const customer = getCustomer(inv.customerId)?.companyName ?? ''
      return (
        String(inv.invoiceNumber).toLowerCase().includes(q) ||
        customer.toLowerCase().includes(q) ||
        inv.items.some((it) => it.name.toLowerCase().includes(q))
      )
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'total') cmp = totalOf(a) - totalOf(b)
      else if (sortKey === 'invoiceNumber')
        cmp = String(a.invoiceNumber).localeCompare(String(b.invoiceNumber))
      else cmp = String(a.issueDate).localeCompare(String(b.issueDate))
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [data.invoices, query, statusFilter, bizFilter, sortKey, sortAsc, getCustomer])

  // 絞り込み結果の合計金額（フィルタした事業の売上把握に便利）
  const filteredTotal = rows.reduce((s, inv) => s + totalOf(inv), 0)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  // ★ コピー機能：元請求書のコピーは生成せず、新規作成画面へ id を渡すだけ。
  //   生成ロジック（採番・日付更新）は InvoiceForm 側に一本化する。
  const handleCopy = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/invoices/new?copyFrom=${id}`)
  }

  const handleDelete = (e: React.MouseEvent, inv: Invoice) => {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`請求書 ${inv.invoiceNumber} を削除しますか？`)) deleteInvoice(inv.id)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">請求書</h1>
        <Link
          to="/invoices/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ＋ 新規作成
        </Link>
      </div>

      {/* 検索・フィルタ */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="請求書番号・顧客名・品目で検索"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="all">すべてのステータス</option>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={bizFilter}
          onChange={(e) => setBizFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="all">すべての事業種別</option>
          {data.businessTypes.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value="__none__">未分類</option>
        </select>
      </div>

      {/* 絞り込み結果の件数・合計 */}
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>{rows.length} 件</span>
        <span>
          合計金額{' '}
          <span className="font-semibold text-slate-800">{yen(filteredTotal)}</span>
        </span>
      </div>

      {/* テーブル */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="cursor-pointer px-4 py-3 select-none" onClick={() => toggleSort('invoiceNumber')}>
                  請求書番号{arrow('invoiceNumber')}
                </th>
                <th className="px-4 py-3">顧客</th>
                <th className="cursor-pointer px-4 py-3 select-none" onClick={() => toggleSort('issueDate')}>
                  発行日{arrow('issueDate')}
                </th>
                <th className="px-4 py-3">支払期限</th>
                <th className="cursor-pointer px-4 py-3 text-right select-none" onClick={() => toggleSort('total')}>
                  金額{arrow('total')}
                </th>
                <th className="px-4 py-3">ステータス</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    該当する請求書がありません
                  </td>
                </tr>
              )}
              {rows.map((inv) => (
                <tr
                  key={inv.id}
                  className="cursor-pointer transition hover:bg-slate-50"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{inv.invoiceNumber}</div>
                    <div className="text-xs text-slate-400">請求者: {inv.issuer.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-600">
                      {getCustomer(inv.customerId)?.companyName ?? '—'}
                    </div>
                    {inv.businessType && (
                      <div className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {inv.businessType}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{jpDate(inv.issueDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{jpDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {yen(totalOf(inv))}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* ★ この請求書をコピーして作成 */}
                      <button
                        onClick={(e) => handleCopy(e, inv.id)}
                        title="この請求書をコピーして新規作成"
                        className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                      >
                        📋 コピー
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, inv)}
                        title="削除"
                        className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
