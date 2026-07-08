import { Link } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { computeTotals } from '../lib/calc'
import { yen, jpDate } from '../lib/format'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const { data, getCustomer } = useApp()
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const monthInvoices = data.invoices.filter((i) =>
    i.issueDate.startsWith(thisMonth)
  )

  const totalOf = (inv: (typeof data.invoices)[number]) =>
    computeTotals(inv.items).total

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
