import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  List,
  PlusCircle,
  Upload,
  TrendingUp,
} from 'lucide-react'
import { cn } from '../utils/cn'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trades', label: 'Trades', icon: List },
  { to: '/journal', label: 'Daily Journal', icon: BookOpen },
  { to: '/add-trade', label: 'Add Trade', icon: PlusCircle },
  { to: '/import', label: 'Import CSV', icon: Upload },
]

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-surface-200 bg-surface-950 text-white">
      <div className="flex items-center gap-2 border-b border-surface-800 px-6 py-5">
        <div className="rounded-lg bg-brand-600 p-2">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Trade Journal</h1>
          <p className="text-xs text-slate-400">Trading Analytics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-surface-800 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-surface-800 p-4">
        <p className="text-xs text-slate-500">数据存储在本地浏览器</p>
      </div>
    </aside>
  )
}
