import { useState } from 'react'
import { useApp } from '../store/AppContext'
import type { IssuerInfo } from '../types'

export default function Settings() {
  const { data, updateIssuer } = useApp()
  const [form, setForm] = useState<IssuerInfo>({ ...data.issuer })
  const [saved, setSaved] = useState(false)

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  const set = (key: keyof IssuerInfo, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = () => {
    updateIssuer(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const fields: [keyof IssuerInfo, string, string?][] = [
    ['companyName', '会社名 / 屋号'],
    ['registrationNumber', '適格請求書発行事業者登録番号', 'T + 13桁（例：T1234567890123）'],
    ['address', '住所'],
    ['tel', '電話番号'],
    ['email', 'メールアドレス'],
    ['bankInfo', '振込先'],
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">設定（請求元情報）</h1>

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-sm text-slate-500">
          ここで設定した情報が、新規請求書作成時の「請求元」初期値になります。
        </p>
        <div className="space-y-4">
          {fields.map(([key, label, hint]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
              <input
                className={inputCls}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
              {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-600">✓ 保存しました</span>}
          <button
            onClick={save}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}
