import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, CalendarDays, BookMarked, Upload } from 'lucide-react'
import { cn } from '../utils/cn'

const items = [
  { to: '/', label: '首页', icon: LayoutDashboard, end: true },
  { to: '/trades', label: '交易', icon: List },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/playbook', label: '案例', icon: BookMarked },
  { to: '/import', label: '导入', icon: Upload },
]

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-[52px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-brand-600' : 'text-slate-500'
              )
            }
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
