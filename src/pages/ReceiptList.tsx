import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { yen, jpDate } from '../lib/format'

export default function ReceiptList() {
  const { data, deleteReceipt } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data.receipts
    return data.receipts.filter(
      (r) =>
        r.receiptNo.toLowerCase().includes(q) ||
        r.recipientName.toLowerCase().includes(q) ||
        r.issuer.name.toLowerCase().includes(q)
    )
  }, [data.receipts, query])

  const total = rows.reduce((s, r) => s + r.total, 0)

  const handleDelete = (e: React.MouseEvent, id: string, no: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`領収書 ${no} を削除しますか？`)) deleteReceipt(id)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">領収書（台帳）</h1>
        <Link
          to="/receipts/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ＋ 新規発行
        </Link>
      </div>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="領収書番号・宛名・請求元で検索"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-96"
        />
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>{rows.length} 件</span>
        <span>
          合計金額 <span className="font-semibold text-slate-800">{yen(total)}</span>
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">領収書番号</th>
                <th className="px-4 py-3">宛名</th>
                <th className="px-4 py-3">請求元</th>
                <th className="px-4 py-3">領収日</th>
                <th className="px-4 py-3 text-right">金額</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    領収書がありません
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer transition hover:bg-slate-50"
                  onClick={() => navigate(`/receipts/${r.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{r.receiptNo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.recipientName} {r.honorific}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.issuer.name}</td>
                  <td className="px-4 py-3 text-slate-600">{jpDate(r.receiptDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {yen(r.total)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={(e) => handleDelete(e, r.id, r.receiptNo)}
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
