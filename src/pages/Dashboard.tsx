import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals } from '../lib/calc'
import { yen, jpDate } from '../lib/format'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const { data, getCustomer } = useApp()
  const [bizPeriod, setBizPeriod] = useState<'month' | 'all'>('month')
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const monthInvoices = data.invoices.filter((i) =>
    i.issueDate.startsWith(thisMonth)
  )

  const totalOf = (inv: (typeof data.invoices)[number]) =>
    computeTotals(inv.items, inv.issuer.taxMode).total

  // 事業種別ごとの売上集計（今月／全期間で切替）
  const bizBreakdown = useMemo(() => {
    const source = bizPeriod === 'month' ? monthInvoices : data.invoices
    const map = new Map<string, number>()
    for (const inv of source) {
      const key = inv.businessType || '未分類'
      map.set(key, (map.get(key) ?? 0) + totalOf(inv))
    }
    const rows = [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    const total = rows.reduce((s, r) => s + r.amount, 0)
    return { rows, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizPeriod, data.invoices])

  const salesTotal = monthInvoices.reduce((s, i) => s + totalOf(i), 0)
  const paidTotal = data.invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + totalOf(i), 0)
  const unpaidTotal = data.invoices
    .filter((i) => ['issued', 'awaiting_payment', 'overdue'].includes(i.status))
    .reduce((s, i) => s + totalOf(i), 0)

  const recent = [...data.invoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  const cards = [
    { label: '今月の売上合計', value: yen(salesTotal), color: 'text-brand-600', sub: `${monthInvoices.length}件` },
    { label: '未入金金額', value: yen(unpaidTotal), color: 'text-amber-600', sub: '入金待ち・延滞含む' },
    { label: '入金済み金額', value: yen(paidTotal), color: 'text-emerald-600', sub: '累計' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">ダッシュボード</h1>
        <Link
          to="/invoices/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ＋ 新規請求書
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className={`mt-2 text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="mt-1 text-xs text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 事業別売上 */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">事業別売上</h2>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
            {(
              [
                ['month', '今月'],
                ['all', '全期間'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBizPeriod(key)}
                className={`px-3 py-1.5 font-medium transition ${
                  bizPeriod === key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          {bizBreakdown.rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              対象の請求書がありません
            </div>
          ) : (
            <div className="space-y-3">
              {bizBreakdown.rows.map((r) => {
                const pct = bizBreakdown.total
                  ? Math.round((r.amount / bizBreakdown.total) * 100)
                  : 0
                return (
                  <div key={r.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{r.name}</span>
                      <span className="text-slate-600">
                        {yen(r.amount)}
                        <span className="ml-2 text-xs text-slate-400">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-800">
                <span>合計</span>
                <span>{yen(bizBreakdown.total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">直近の請求書</h2>
          <Link to="/invoices" className="text-sm text-brand-600 hover:underline">
            すべて見る →
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recent.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              請求書がありません
            </div>
          )}
          {recent.map((inv) => (
            <Link
              key={inv.id}
              to={`/invoices/${inv.id}`}
              className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50"
            >
              <div>
                <div className="font-medium text-slate-800">{inv.invoiceNumber}</div>
                <div className="text-sm text-slate-500">
                  {getCustomer(inv.customerId)?.companyName ?? '（顧客未設定）'} ・ 発行 {jpDate(inv.issueDate)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={inv.status} />
                <div className="w-28 text-right font-semibold text-slate-800">
                  {yen(totalOf(inv))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
