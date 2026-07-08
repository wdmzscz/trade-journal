import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry } from '../types'
import { calculateTradePnl } from '../utils/stats'

const TRADES_KEY = 'trade-journal-trades'
const JOURNAL_KEY = 'trade-journal-journal'

function loadTrades(): Trade[] {
  try {
    const raw = localStorage.getItem(TRADES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

interface TradeStoreContextValue {
  trades: Trade[]
  journal: JournalEntry[]
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  importTrades: (trades: Trade[]) => void
  saveJournal: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
  deleteJournal: (id: string) => void
  getJournalByDate: (date: string) => JournalEntry | undefined
  accounts: string[]
}

const TradeStoreContext = createContext<TradeStoreContextValue | null>(null)

function computePnl(trade: Partial<Trade> & Pick<Trade, 'side' | 'entryPrice' | 'quantity' | 'fees'>): number {
  if (trade.status === 'open' || trade.exitPrice === undefined) return 0
  return calculateTradePnl(trade.side, trade.entryPrice, trade.exitPrice, trade.quantity, trade.fees)
}

export function TradeStoreProvider({ children }: { children: ReactNode }) {
  const [trades, setTrades] = useState<Trade[]>(loadTrades)
  const [journal, setJournal] = useState<JournalEntry[]>(loadJournal)

  useEffect(() => {
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  }, [trades])

  useEffect(() => {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
  }, [journal])

  const addTrade = useCallback((input: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => {
    const now = new Date().toISOString()
    const trade: Trade = {
      ...input,
      id: uuidv4(),
      pnl: input.pnl ?? computePnl(input),
      createdAt: now,
      updatedAt: now,
    }
    setTrades((prev) => [trade, ...prev])
  }, [])

  const updateTrade = useCallback((id: string, updates: Partial<Trade>) => {
    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const merged = { ...t, ...updates, updatedAt: new Date().toISOString() }
        merged.pnl = computePnl(merged)
        return merged
      })
    )
  }, [])

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const importTrades = useCallback((newTrades: Trade[]) => {
    setTrades((prev) => [...newTrades, ...prev])
  }, [])

  const saveJournal = useCallback((input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString()
    setJournal((prev) => {
      const existing = input.id ? prev.find((j) => j.id === input.id) : prev.find((j) => j.date === input.date)
      if (existing) {
        return prev.map((j) =>
          j.id === existing.id ? { ...j, ...input, id: existing.id, updatedAt: now } : j
        )
      }
      const entry: JournalEntry = {
        ...input,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }
      return [entry, ...prev.filter((j) => j.date !== input.date)]
    })
  }, [])

  const deleteJournal = useCallback((id: string) => {
    setJournal((prev) => prev.filter((j) => j.id !== id))
  }, [])

  const getJournalByDate = useCallback(
    (date: string) => journal.find((j) => j.date === date),
    [journal]
  )

  const accounts = [...new Set(trades.map((t) => t.account))].sort()

  return (
    <TradeStoreContext.Provider
      value={{ trades, journal, addTrade, updateTrade, deleteTrade, importTrades, saveJournal, deleteJournal, getJournalByDate, accounts }}
    >
      {children}
    </TradeStoreContext.Provider>
  )
}

export function useTradeStore() {
  const ctx = useContext(TradeStoreContext)
  if (!ctx) throw new Error('useTradeStore must be used within TradeStoreProvider')
  return ctx
}
