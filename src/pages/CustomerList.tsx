import { useState } from 'react'
import { useApp } from '../store/AppContext'
import type { Customer } from '../types'

const EMPTY: Omit<Customer, 'id'> = {
  companyName: '',
  contactName: '',
  email: '',
  address: '',
  phone: '',
}

export default function CustomerList() {
  const { data, session, syncEnabled, addCustomer, updateCustomer, deleteCustomer, mergeDuplicateCustomers } =
    useApp()
  const [editing, setEditing] = useState<Customer | null>(null)
  const [draft, setDraft] = useState<Omit<Customer, 'id'>>(EMPTY)
  const [open, setOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const isOwner = !session || session.role === 'owner'

  const handleMerge = async () => {
    if (!confirm('企業名が同じ顧客を1件に統合します。よろしいですか？')) return
    setMerging(true)
    const merged = await mergeDuplicateCustomers()
    setMerging(false)
    if (merged === null) alert('統合に失敗しました。接続をご確認ください。')
    else if (merged === 0) alert('重複している顧客は見つかりませんでした。')
    else alert(`${merged}件の重複を統合しました。`)
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  const openNew = () => {
    setEditing(null)
    setDraft(EMPTY)
    setOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setDraft({ ...c })
    setOpen(true)
  }

  const save = () => {
    if (!draft.companyName.trim()) {
      alert('企業名は必須です')
      return
    }
    if (editing) updateCustomer({ ...editing, ...draft })
    else addCustomer(draft)
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">顧客一覧</h1>
        <div className="flex gap-2">
          {isOwner && syncEnabled && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {merging ? '統合中…' : '重複を統合'}
            </button>
          )}
          <button
            onClick={openNew}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            ＋ 顧客を登録
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">企業名</th>
                <th className="px-4 py-3">担当者</th>
                <th className="px-4 py-3">メール</th>
                <th className="px-4 py-3">電話</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    顧客が登録されていません
                  </td>
                </tr>
              )}
              {data.customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.companyName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.contactName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(c)}
                        className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${c.companyName} を削除しますか？`)) deleteCustomer(c.id)
                        }}
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

      {/* モーダル */}
      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">
              {editing ? '顧客を編集' : '顧客を登録'}
            </h2>
            <div className="space-y-3">
              {(
                [
                  ['companyName', '企業名'],
                  ['contactName', '担当者名'],
                  ['email', 'メールアドレス'],
                  ['address', '住所'],
                  ['phone', '電話番号'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
                  <input
                    className={inputCls}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={save}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
