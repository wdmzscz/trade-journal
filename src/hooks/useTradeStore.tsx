import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry, AccountProfile, AccountInfo, AccountType } from '../types'
import { calculateTradePnl } from '../utils/stats'

const TRADES_KEY = 'trade-journal-trades'
const JOURNAL_KEY = 'trade-journal-journal'
const ACCOUNT_KEY = 'trade-journal-selected-account'
const PROFILES_KEY = 'trade-journal-account-profiles'

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

function loadProfiles(): AccountProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadSelectedAccount(): string {
  return localStorage.getItem(ACCOUNT_KEY) ?? 'all'
}

function inferAccountType(trades: Trade[]): AccountType {
  const futures = trades.filter((t) => t.assetClass === 'futures').length
  const stocks = trades.filter((t) => t.assetClass === 'stock').length
  if (futures > stocks) return 'futures'
  if (stocks > futures) return 'stock'
  return 'other'
}

interface TradeStoreContextValue {
  trades: Trade[]
  filteredTrades: Trade[]
  journal: JournalEntry[]
  filteredJournal: JournalEntry[]
  selectedAccount: string
  selectedAccountInfo: AccountInfo | null
  setSelectedAccount: (account: string) => void
  accountProfiles: AccountProfile[]
  accountInfos: AccountInfo[]
  registerAccount: (id: string, label: string, type: AccountType) => void
  updateAccount: (id: string, updates: { label?: string; type?: AccountType }) => void
  deleteAccount: (id: string) => void
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  importTrades: (trades: Trade[], options?: { replaceAccount?: string }) => void
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
  const [accountProfiles, setAccountProfiles] = useState<AccountProfile[]>(loadProfiles)
  const [selectedAccount, setSelectedAccountState] = useState<string>(loadSelectedAccount)

  useEffect(() => {
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  }, [trades])

  useEffect(() => {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
  }, [journal])

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(accountProfiles))
  }, [accountProfiles])

  useEffect(() => {
    localStorage.setItem(ACCOUNT_KEY, selectedAccount)
  }, [selectedAccount])

  const setSelectedAccount = useCallback((account: string) => {
    setSelectedAccountState(account)
  }, [])

  const registerAccount = useCallback((id: string, label: string, type: AccountType) => {
    const trimmedId = id.trim()
    if (!trimmedId) return
    const now = new Date().toISOString()
    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === trimmedId)
      if (existing) {
        return prev.map((p) =>
          p.id === trimmedId ? { ...p, label: label.trim() || trimmedId, type } : p
        )
      }
      return [...prev, { id: trimmedId, label: label.trim() || trimmedId, type, createdAt: now }]
    })
    setSelectedAccountState(trimmedId)
  }, [])

  const updateAccount = useCallback((id: string, updates: { label?: string; type?: AccountType }) => {
    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === id)
      if (existing) {
        return prev.map((p) =>
          p.id === id
            ? {
                ...p,
                label: updates.label !== undefined ? updates.label.trim() || id : p.label,
                type: updates.type ?? p.type,
              }
            : p
        )
      }
      return [
        ...prev,
        {
          id,
          label: updates.label?.trim() || id,
          type: updates.type ?? inferAccountType(trades.filter((t) => t.account === id)),
          createdAt: new Date().toISOString(),
        },
      ]
    })
  }, [trades])

  const deleteAccount = useCallback((id: string) => {
    setAccountProfiles((prev) => prev.filter((p) => p.id !== id))
    setTrades((prev) => prev.filter((t) => t.account !== id))
    setJournal((prev) => prev.filter((j) => j.account !== id))
    setSelectedAccountState((current) => (current === id ? 'all' : current))
  }, [])

  const filteredTrades = useMemo(() => {
    if (selectedAccount === 'all') return trades
    return trades.filter((t) => t.account === selectedAccount)
  }, [trades, selectedAccount])

  const filteredJournal = useMemo(() => {
    if (selectedAccount === 'all') return journal
    return journal.filter((j) => j.account === selectedAccount)
  }, [journal, selectedAccount])

  const accounts = useMemo(() => {
    const ids = new Set<string>()
    accountProfiles.forEach((p) => ids.add(p.id))
    trades.forEach((t) => ids.add(t.account))
    return [...ids].sort()
  }, [trades, accountProfiles])

  const accountInfos = useMemo((): AccountInfo[] => {
    return accounts.map((id) => {
      const profile = accountProfiles.find((p) => p.id === id)
      const accountTrades = trades.filter((t) => t.account === id)
      const closed = accountTrades.filter((t) => t.status === 'closed')
      return {
        id,
        label: profile?.label ?? id,
        type: profile?.type ?? inferAccountType(accountTrades),
        tradeCount: accountTrades.length,
        totalPnl: closed.reduce((sum, t) => sum + t.pnl, 0),
      }
    })
  }, [accounts, accountProfiles, trades])

  const selectedAccountInfo = useMemo(() => {
    if (selectedAccount === 'all') return null
    return accountInfos.find((a) => a.id === selectedAccount) ?? null
  }, [selectedAccount, accountInfos])

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

  const importTrades = useCallback((newTrades: Trade[], options?: { replaceAccount?: string }) => {
    const accountId = options?.replaceAccount ?? newTrades[0]?.account
    if (accountId) {
      const accountTrades = newTrades.filter((t) => t.account === accountId)
      setAccountProfiles((prev) => {
        if (prev.some((p) => p.id === accountId)) return prev
        const type = inferAccountType(accountTrades)
        return [
          ...prev,
          {
            id: accountId,
            label: accountId,
            type,
            createdAt: new Date().toISOString(),
          },
        ]
      })
    }

    setTrades((prev) => {
      const base = options?.replaceAccount
        ? prev.filter((t) => t.account !== options.replaceAccount)
        : prev
      return [...newTrades, ...base]
    })
  }, [])

  const saveJournal = useCallback((input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString()
    setJournal((prev) => {
      const existing = input.id
        ? prev.find((j) => j.id === input.id)
        : prev.find((j) => j.date === input.date && j.account === input.account)
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
      return [entry, ...prev.filter((j) => !(j.date === input.date && j.account === input.account))]
    })
  }, [])

  const deleteJournal = useCallback((id: string) => {
    setJournal((prev) => prev.filter((j) => j.id !== id))
  }, [])

  const getJournalByDate = useCallback(
    (date: string, account?: string) => {
      const scope = account ?? selectedAccount
      if (scope === 'all') {
        return journal.find((j) => j.date === date)
      }
      return journal.find((j) => j.date === date && j.account === scope)
    },
    [journal, selectedAccount]
  )

  return (
    <TradeStoreContext.Provider
      value={{
        trades,
        filteredTrades,
        journal,
        filteredJournal,
        selectedAccount,
        selectedAccountInfo,
        setSelectedAccount,
        accountProfiles,
        accountInfos,
        registerAccount,
        updateAccount,
        deleteAccount,
        addTrade,
        updateTrade,
        deleteTrade,
        importTrades,
        saveJournal,
        deleteJournal,
        getJournalByDate,
        accounts,
      }}
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
