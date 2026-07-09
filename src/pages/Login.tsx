import { useState } from 'react'
import { useApp } from '../store/AppContext'

export default function Login() {
  const { login, gasUrl, setGasUrl } = useApp()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showConn, setShowConn] = useState(false)
  const [urlDraft, setUrlDraft] = useState(gasUrl)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = await login(email, pin)
    setBusy(false)
    if (!res.ok) setError(res.error || 'ログインに失敗しました')
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            K
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Keiri</div>
            <div className="text-xs text-slate-400">ログイン</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">メールアドレス</label>
            <input
              type="email"
              autoComplete="username"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">PIN（暗証番号）</label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || !email || !pin}
          className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? '確認中…' : 'ログイン'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          アカウントは管理者（オーナー）が発行します
        </p>

        {/* 接続先の変更（URL 間違いで詰まないための逃げ道） */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowConn((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {showConn ? '接続設定を閉じる' : '接続先の設定（上級者向け）'}
          </button>
          {showConn && (
            <div className="mt-2 space-y-2">
              <input
                className={inputCls}
                placeholder="GAS ウェブアプリ URL"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGasUrl(urlDraft)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  接続先を保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGasUrl('')
                    setUrlDraft('')
                  }}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  ローカルに戻す
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
