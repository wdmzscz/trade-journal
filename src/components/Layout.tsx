import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X, TrendingUp } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { AccountTabs } from './AccountTabs'
import { PaperAccountConfigPanel } from './PaperAccountConfigPanel'
import { MobileNav } from './MobileNav'
import { PullToRefresh } from './PullToRefresh'
import { ThemeToggle } from './ThemeToggle'
import { useTradeStore } from '../hooks/useTradeStore'

export function Layout() {
  const { selectedAccount } = useTradeStore()
  const { pathname } = useLocation()
  const isScreener = pathname === '/screener'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-surface-50 dark:bg-surface-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full w-[min(280px,85vw)] shadow-2xl">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-surface-800 hover:text-white"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <PullToRefresh className="flex min-w-0 flex-1 flex-col overflow-auto">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-md pt-safe dark:border-surface-800 dark:bg-surface-950/95 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-800"
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="rounded-lg bg-brand-600 p-1.5">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="truncate font-bold text-slate-900 dark:text-slate-100">Trade Journal</span>
          </div>
          <ThemeToggle variant="header" />
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-8 pb-nav-safe">
          {isScreener ? (
            <Outlet />
          ) : (
            <>
              <AccountTabs />
              <div className="flex flex-1 flex-col gap-4 pt-4 sm:gap-5 sm:pt-6">
                <PaperAccountConfigPanel />
                <Outlet key={selectedAccount} />
              </div>
            </>
          )}
        </div>

        <MobileNav />
      </PullToRefresh>
    </div>
  )
}
