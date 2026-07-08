import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AccountTabs } from './AccountTabs'
import { useTradeStore } from '../hooks/useTradeStore'

export function Layout() {
  const { selectedAccount } = useTradeStore()

  return (
    <div className="flex min-h-screen bg-surface-50">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-6 lg:px-8 lg:py-8">
          <AccountTabs />
          <div className="flex-1 pt-6">
            <Outlet key={selectedAccount} />
          </div>
        </div>
      </main>
    </div>
  )
}
