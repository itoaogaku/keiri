import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../store/AppContext'

const NAV = [
  { to: '/', label: 'ダッシュボード', icon: '📊', end: true, ownerOnly: false },
  { to: '/invoices', label: '請求書', icon: '📄', end: false, ownerOnly: false },
  { to: '/receipts', label: '領収書', icon: '🧾', end: false, ownerOnly: false },
  { to: '/customers', label: '顧客一覧', icon: '👥', end: false, ownerOnly: false },
  { to: '/settings', label: '設定', icon: '⚙️', end: false, ownerOnly: true },
]

export default function Layout() {
  const { syncEnabled, session, logout } = useApp()
  const isOwner = !session || session.role === 'owner'
  const nav = NAV.filter((item) => !item.ownerOnly || isOwner)
  return (
    <div className="min-h-screen">
      {/* サイドバー */}
      <aside className="no-print fixed inset-y-0 left-0 flex w-60 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            K
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Keiri</div>
            <div className="text-xs text-slate-400">請求書管理</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* ユーザー・保存先ステータス */}
        <div className="mt-auto space-y-2 px-2 pt-6">
          {session && (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700">
                    {session.name || session.email}
                  </div>
                  <div className="text-xs text-slate-400">
                    {session.role === 'owner' ? 'オーナー（全データ）' : '制限（自分のみ）'}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-50"
                >
                  ログアウト
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                syncEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <span className="text-slate-500">
              {syncEnabled ? 'スプレッドシート同期中' : 'ローカル保存'}
            </span>
          </div>
        </div>
      </aside>

      {/* メイン */}
      <main className="ml-0 px-6 py-8 md:ml-60">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
