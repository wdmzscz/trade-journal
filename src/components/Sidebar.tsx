import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  List,
  PlusCircle,
  Upload,
  TrendingUp,
  CalendarDays,
  LogOut,
  RefreshCw,
  BookMarked,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { StorageInfo } from './StorageInfo'
import { useAuth } from '../hooks/useAuth'
import { isCloudEnabled } from '../lib/supabase'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trades', label: 'Trades', icon: List },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/playbook', label: 'Playbook', icon: BookMarked },
  { to: '/journal', label: 'Daily Journal', icon: BookOpen },
  { to: '/add-trade', label: 'Add Trade', icon: PlusCircle },
  { to: '/import', label: 'Import CSV', icon: Upload },
  { to: '/ibkr-sync', label: 'IBKR Sync', icon: RefreshCw },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut } = useAuth()
  const cloud = isCloudEnabled()

  return (
    <aside className="flex h-full w-64 flex-col border-r border-surface-200 bg-surface-950 text-white lg:min-h-screen">
      <div className="flex items-center gap-2 border-b border-surface-800 px-5 py-4 sm:px-6 sm:py-5">
        <div className="rounded-lg bg-brand-600 p-2">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Trade Journal</h1>
          <p className="text-xs text-slate-400">Trading Analytics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-surface-800 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-surface-800 p-3 sm:p-4 space-y-3">
        <StorageInfo variant="dark" />
        {cloud && (
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full min-h-[36px] items-center justify-center gap-2 rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-surface-600 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出登录
          </button>
        )}
      </div>
    </aside>
  )
}
