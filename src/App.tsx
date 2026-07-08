import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TradeStoreProvider } from './hooks/useTradeStore'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { TradesPage } from './pages/TradesPage'
import { DailyJournalPage } from './pages/DailyJournalPage'
import { CalendarPage } from './pages/CalendarPage'
import { AddTradePage } from './pages/AddTradePage'
import { ImportCsvPage } from './pages/ImportCsvPage'
import { seedSampleData } from './utils/sampleData'

seedSampleData()

export default function App() {
  return (
    <TradeStoreProvider>
      <BrowserRouter>
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
