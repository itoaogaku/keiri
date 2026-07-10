import { useState } from 'react'
import { useApp } from '../store/AppContext'
import { TAX_MODE_LABELS, type IssuerProfile, type TaxMode } from '../types'

function SheetConnection() {
  const { gasUrl, setGasUrl, syncEnabled } = useApp()
  const [value, setValue] = useState(gasUrl)
  const [saved, setSaved] = useState(false)

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold text-slate-800">スプレッドシート連携</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            syncEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {syncEnabled ? '接続中' : '未接続'}
        </span>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Google Apps Script で発行した「ウェブアプリ URL」を貼ると、入力データが
        スプレッドシートに蓄積されます。未設定でもこの端末内（localStorage）で動作します。
        手順は <code>GAS_SETUP.md</code> を参照してください。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={inputCls}
          placeholder="https://script.google.com/macros/s/.../exec"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          onClick={() => {
            setGasUrl(value)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
          }}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          接続
        </button>
      </div>
      {saved && <p className="mt-2 text-sm text-emerald-600">✓ 保存しました</p>}
    </div>
  )
}

const EMPTY: Omit<IssuerProfile, 'id'> = {
  name: '',
  taxMode: 'taxable',
  registrationNumber: '',
  address: '',
  tel: '',
  email: '',
  bankName: '',
  branchName: '',
  accountType: '普通',
  accountNumber: '',
  accountHolder: '',
}

function BusinessTypesSection() {
  const { data, addBusinessType, removeBusinessType } = useApp()
  const [value, setValue] = useState('')

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  const add = () => {
    addBusinessType(value)
    setValue('')
  }

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-800">事業種別</h2>
      <p className="mb-3 text-sm text-slate-500">
        請求書作成時に選べる分類です。スプレッドシートの「事業種別」列に記録され、
        事業ごとの売上集計に使えます。
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {data.businessTypes.length === 0 && (
          <span className="text-sm text-slate-400">まだ登録がありません</span>
        )}
        {data.businessTypes.map((b) => (
          <span
            key={b}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
          >
            {b}
            <button
              onClick={() => removeBusinessType(b)}
              className="text-slate-400 transition hover:text-red-500"
              title="削除"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="新しい事業種別を入力"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button
          onClick={add}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          追加
        </button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { data, session, addIssuer, updateIssuer, deleteIssuer } = useApp()
  const [editing, setEditing] = useState<IssuerProfile | null>(null)
  const [draft, setDraft] = useState<Omit<IssuerProfile, 'id'>>(EMPTY)
  const [open, setOpen] = useState(false)

  // 制限ユーザーは設定を変更できない
  if (session && session.role !== 'owner') {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold text-slate-800">設定</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          この画面はオーナー専用です。
        </div>
      </div>
    )
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  const openNew = () => {
    setEditing(null)
    setDraft(EMPTY)
    setOpen(true)
  }

  const openEdit = (i: IssuerProfile) => {
    setEditing(i)
    setDraft({ ...i })
    setOpen(true)
  }

  const save = () => {
    if (!draft.name.trim()) {
      alert('請求者名は必須です')
      return
    }
    if (editing) updateIssuer({ ...editing, ...draft })
    else addIssuer(draft)
    setOpen(false)
  }

  const handleSealFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      alert('画像が大きすぎます（1MB以下のPNGを推奨）。')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      // 透過（アルファ）を持つか判定し、無ければ警告する
      const img = new Image()
      img.onload = () => {
        let hasAlpha = false
        try {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const d = ctx.getImageData(0, 0, c.width, c.height).data
          for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) {
              hasAlpha = true
              break
            }
          }
        } catch {
          hasAlpha = true
        }
        setDraft((dd) => ({ ...dd, sealImage: url }))
        if (!hasAlpha) {
          alert(
            'この画像は背景が透過されていません。\n背景が透明なPNG画像をご利用ください（JPEGは透過できません）。'
          )
        }
      }
      img.onerror = () => setDraft((dd) => ({ ...dd, sealImage: url }))
      img.src = url
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">設定</h1>

      <SheetConnection />

      <BusinessTypesSection />

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">請求者（請求元）の管理</h2>
        <button
          onClick={openNew}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          ＋ 請求者を追加
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        請求書作成時にここから請求者を選んで使い分けます。非課税枠の請求者では消費税を計算しません。
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.issuers.map((i) => (
          <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="font-semibold text-slate-800">{i.name}</div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  i.taxMode === 'exempt'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {TAX_MODE_LABELS[i.taxMode]}
              </span>
            </div>
            <div className="mt-3 space-y-0.5 text-sm text-slate-500">
              <div>登録番号：{i.registrationNumber || '—'}</div>
              <div>{i.address || '住所未設定'}</div>
              <div>{i.tel || 'TEL未設定'}</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => openEdit(i)}
                className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
              >
                編集
              </button>
              <button
                onClick={() => {
                  if (data.issuers.length <= 1) {
                    alert('請求者は最低1件必要です')
                    return
                  }
                  if (confirm(`「${i.name}」を削除しますか？`)) deleteIssuer(i.id)
                }}
                className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* モーダル */}
      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">
              {editing ? '請求者を編集' : '請求者を追加'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">請求者名</label>
                <input
                  className={inputCls}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">課税区分</label>
                <select
                  className={inputCls}
                  value={draft.taxMode}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, taxMode: e.target.value as TaxMode }))
                  }
                >
                  <option value="taxable">課税（消費税を計算する）</option>
                  <option value="exempt">非課税（消費税を計算しない）</option>
                </select>
              </div>
              {(
                [
                  ['registrationNumber', '適格請求書発行事業者登録番号'],
                  ['address', '住所'],
                  ['tel', '電話番号'],
                  ['email', 'メールアドレス'],
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

              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">振込先</div>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['bankName', '銀行名'],
                      ['branchName', '支店名'],
                      ['accountType', '種別（普通/当座）'],
                      ['accountNumber', '口座番号'],
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
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">口座名（名義）</label>
                  <input
                    className={inputCls}
                    value={draft.accountHolder}
                    onChange={(e) => setDraft((d) => ({ ...d, accountHolder: e.target.value }))}
                  />
                </div>
              </div>

              {/* 角印 */}
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">角印（印鑑画像）</div>
                <p className="mb-2 text-xs text-slate-400">
                  背景が透過されたPNG画像を推奨します。請求書の社名・住所付近に押印表示されます。
                </p>
                <div className="flex items-center gap-3">
                  {draft.sealImage && (
                    <img
                      src={draft.sealImage}
                      alt="角印プレビュー"
                      title="市松模様が透けて見えれば背景は透過されています"
                      className="h-16 w-16 rounded border border-slate-200 object-contain p-1"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)',
                        backgroundSize: '12px 12px',
                        backgroundPosition: '0 0,6px 6px',
                      }}
                    />
                  )}
                  <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    画像を選択
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      className="hidden"
                      onChange={handleSealFile}
                    />
                  </label>
                  {draft.sealImage && (
                    <button
                      onClick={() => setDraft((d) => ({ ...d, sealImage: undefined }))}
                      className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
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
