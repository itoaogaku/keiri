import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'ダッシュボード', icon: '📊', end: true },
  { to: '/invoices', label: '請求書', icon: '📄', end: false },
  { to: '/customers', label: '顧客一覧', icon: '👥', end: false },
  { to: '/settings', label: '設定（請求元）', icon: '⚙️', end: false },
]

export default function Layout() {
  return (
    <div className="min-h-screen">
      {/* サイドバー */}
      <aside className="no-print fixed inset-y-0 left-0 w-60 border-r border-slate-200 bg-white px-4 py-6">
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
          {NAV.map((item) => (
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
