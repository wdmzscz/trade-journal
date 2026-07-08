import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { TradeStoreProvider } from './hooks/useTradeStore'
import { isCloudEnabled } from './lib/supabase'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TradesPage } from './pages/TradesPage'
import { DailyJournalPage } from './pages/DailyJournalPage'
import { CalendarPage } from './pages/CalendarPage'
import { AddTradePage } from './pages/AddTradePage'
import { ImportCsvPage } from './pages/ImportCsvPage'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const cloud = isCloudEnabled()

  if (cloud && loading) return <LoadingScreen />
  if (cloud && !user) return <LoginPage />

  return (
    <TradeStoreProvider userId={user?.id}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/trades" element={<TradesPage />} />
            <Route path="/journal" element={<DailyJournalPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/add-trade" element={<AddTradePage />} />
            <Route path="/import" element={<ImportCsvPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TradeStoreProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
