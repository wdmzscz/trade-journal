import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry, AccountProfile, AccountInfo, AccountType } from '../types'
import { calculateTradePnl } from '../utils/stats'
import { mergeTrades } from '../utils/storage'
import type { IbkrAccountFinancials } from '../utils/ibkrImport'
import { isCloudEnabled } from '../lib/supabase'
import {
  fetchAllData,
  uploadAllData,
  upsertTrade,
  deleteTradeCloud,
  upsertTrades,
  deleteTradesByAccount,
  upsertJournal,
  deleteJournalCloud,
  deleteJournalByAccount,
  upsertProfile,
  deleteProfileCloud,
  subscribeToChanges,
} from '../lib/cloudSync'

const TRADES_KEY = 'trade-journal-trades'
const JOURNAL_KEY = 'trade-journal-journal'
const ACCOUNT_KEY = 'trade-journal-selected-account'
const PROFILES_KEY = 'trade-journal-account-profiles'

function accountKey(userId?: string) {
  return userId ? `${ACCOUNT_KEY}-${userId}` : ACCOUNT_KEY
}

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

function loadSelectedAccount(userId?: string): string {
  return localStorage.getItem(accountKey(userId)) ?? 'all'
}

function inferAccountType(trades: Trade[]): AccountType {
  const futures = trades.filter((t) => t.assetClass === 'futures').length
  const stocks = trades.filter((t) => t.assetClass === 'stock').length
  if (futures > stocks) return 'futures'
  if (stocks > futures) return 'stock'
  return 'other'
}

function applyFinancialsToProfile(profile: AccountProfile, financials: IbkrAccountFinancials): AccountProfile {
  return {
    ...profile,
    startingCapital: financials.startingCapital,
    currentCapital: financials.currentCapital,
    totalDeposits: financials.totalDeposits,
    totalWithdrawals: financials.totalWithdrawals,
    cashFlows: financials.cashFlows,
  }
}

export type SyncStatus = 'idle' | 'loading' | 'syncing' | 'error'

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
  updateAccount: (id: string, updates: {
    label?: string
    type?: AccountType
    startingCapital?: number
    currentCapital?: number
  }) => void
  deleteAccount: (id: string) => void
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  importTrades: (trades: Trade[], options?: {
    replaceAccount?: string
    accountFinancials?: IbkrAccountFinancials
  }) => { added: number; skipped: number; replaced: boolean }
  saveJournal: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
  deleteJournal: (id: string) => void
  getJournalByDate: (date: string) => JournalEntry | undefined
  accounts: string[]
  syncStatus: SyncStatus
  cloudEnabled: boolean
  refreshFromCloud?: () => Promise<void>
}

const TradeStoreContext = createContext<TradeStoreContextValue | null>(null)

function computePnl(trade: Partial<Trade> & Pick<Trade, 'side' | 'entryPrice' | 'quantity' | 'fees'>): number {
  if (trade.status === 'open' || trade.exitPrice === undefined) return 0
  return calculateTradePnl(trade.side, trade.entryPrice, trade.exitPrice, trade.quantity, trade.fees)
}

export function TradeStoreProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string
}) {
  const cloudEnabled = isCloudEnabled() && Boolean(userId)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const [trades, setTrades] = useState<Trade[]>(() => (cloudEnabled ? [] : loadTrades()))
  const [journal, setJournal] = useState<JournalEntry[]>(() => (cloudEnabled ? [] : loadJournal()))
  const [accountProfiles, setAccountProfiles] = useState<AccountProfile[]>(() =>
    cloudEnabled ? [] : loadProfiles()
  )
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => loadSelectedAccount(userId))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudEnabled ? 'loading' : 'idle')
  const [cloudReady, setCloudReady] = useState(!cloudEnabled)

  const refetchFromCloud = useCallback(async () => {
    if (!userIdRef.current) return
    try {
      const data = await fetchAllData(userIdRef.current)
      setTrades(data.trades)
      setJournal(data.journal)
      setAccountProfiles(data.profiles)
      setSyncStatus('idle')
    } catch {
      setSyncStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!cloudEnabled || !userId) return

    let cancelled = false

    async function init() {
      setSyncStatus('loading')
      try {
        let data = await fetchAllData(userId!)

        if (data.trades.length === 0 && data.journal.length === 0 && data.profiles.length === 0) {
          const localTrades = loadTrades()
          const localJournal = loadJournal()
          const localProfiles = loadProfiles()
          if (localTrades.length > 0 || localJournal.length > 0 || localProfiles.length > 0) {
            await uploadAllData(userId!, {
              trades: localTrades,
              journal: localJournal,
              profiles: localProfiles,
            })
            data = { trades: localTrades, journal: localJournal, profiles: localProfiles }
          }
        }

        if (!cancelled) {
          setTrades(data.trades)
          setJournal(data.journal)
          setAccountProfiles(data.profiles)
          setSyncStatus('idle')
          setCloudReady(true)
        }
      } catch {
        if (!cancelled) setSyncStatus('error')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [cloudEnabled, userId])

  useEffect(() => {
    if (!cloudEnabled || !userId || !cloudReady) return

    const channel = subscribeToChanges(userId, () => {
      refetchFromCloud()
    })

    return () => {
      channel.unsubscribe()
    }
  }, [cloudEnabled, userId, cloudReady, refetchFromCloud])

  useEffect(() => {
    if (!cloudReady) return
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  }, [trades, cloudReady])

  useEffect(() => {
    if (!cloudReady) return
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
  }, [journal, cloudReady])

  useEffect(() => {
    if (!cloudReady) return
    localStorage.setItem(PROFILES_KEY, JSON.stringify(accountProfiles))
  }, [accountProfiles, cloudReady])

  useEffect(() => {
    localStorage.setItem(accountKey(userId), selectedAccount)
  }, [selectedAccount, userId])

  const cloudWrite = useCallback(async (fn: () => Promise<void>) => {
    if (!cloudEnabled || !userIdRef.current) return
    setSyncStatus('syncing')
    try {
      await fn()
      setSyncStatus('idle')
    } catch {
      setSyncStatus('error')
    }
  }, [cloudEnabled])

  const setSelectedAccount = useCallback((account: string) => {
    setSelectedAccountState(account)
  }, [])

  const registerAccount = useCallback((id: string, label: string, type: AccountType) => {
    const trimmedId = id.trim()
    if (!trimmedId) return
    const now = new Date().toISOString()

    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === trimmedId)
      let profile: AccountProfile
      if (existing) {
        profile = { ...existing, label: label.trim() || trimmedId, type }
      } else {
        profile = { id: trimmedId, label: label.trim() || trimmedId, type, createdAt: now }
      }

      if (cloudEnabled && userIdRef.current) {
        cloudWrite(() => upsertProfile(userIdRef.current!, profile))
      }

      if (existing) {
        return prev.map((p) => (p.id === trimmedId ? profile : p))
      }
      return [...prev, profile]
    })
    setSelectedAccountState(trimmedId)
  }, [cloudEnabled, cloudWrite])

  const updateAccount = useCallback((id: string, updates: {
    label?: string
    type?: AccountType
    startingCapital?: number
    currentCapital?: number
  }) => {
    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === id)
      let profile: AccountProfile
      if (existing) {
        profile = {
          ...existing,
          label: updates.label !== undefined ? updates.label.trim() || id : existing.label,
          type: updates.type ?? existing.type,
          startingCapital: updates.startingCapital ?? existing.startingCapital,
          currentCapital: updates.currentCapital ?? existing.currentCapital,
        }
      } else {
        profile = {
          id,
          label: updates.label?.trim() || id,
          type: updates.type ?? inferAccountType(trades.filter((t) => t.account === id)),
          createdAt: new Date().toISOString(),
          startingCapital: updates.startingCapital,
          currentCapital: updates.currentCapital,
        }
      }

      if (cloudEnabled && userIdRef.current) {
        cloudWrite(() => upsertProfile(userIdRef.current!, profile))
      }

      if (existing) {
        return prev.map((p) => (p.id === id ? profile : p))
      }
      return [...prev, profile]
    })
  }, [cloudEnabled, cloudWrite, trades])

  const deleteAccount = useCallback((id: string) => {
    setAccountProfiles((prev) => prev.filter((p) => p.id !== id))
    setTrades((prev) => prev.filter((t) => t.account !== id))
    setJournal((prev) => prev.filter((j) => j.account !== id))
    setSelectedAccountState((current) => (current === id ? 'all' : current))

    if (cloudEnabled && userIdRef.current) {
      const uid = userIdRef.current
      cloudWrite(async () => {
        await deleteProfileCloud(uid, id)
        await deleteTradesByAccount(uid, id)
        await deleteJournalByAccount(uid, id)
      })
    }
  }, [cloudEnabled, cloudWrite])

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
        startingCapital: profile?.startingCapital,
        currentCapital: profile?.currentCapital,
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

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => upsertTrade(userIdRef.current!, trade))
    }
  }, [cloudEnabled, cloudWrite])

  const updateTrade = useCallback((id: string, updates: Partial<Trade>) => {
    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const merged = { ...t, ...updates, updatedAt: new Date().toISOString() }
        merged.pnl = computePnl(merged)

        if (cloudEnabled && userIdRef.current) {
          cloudWrite(() => upsertTrade(userIdRef.current!, merged))
        }

        return merged
      })
    )
  }, [cloudEnabled, cloudWrite])

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id))

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => deleteTradeCloud(userIdRef.current!, id))
    }
  }, [cloudEnabled, cloudWrite])

  const importTrades = useCallback((newTrades: Trade[], options?: {
    replaceAccount?: string
    accountFinancials?: IbkrAccountFinancials
  }) => {
    const accountId = options?.replaceAccount ?? newTrades[0]?.account
    const isReplace = Boolean(options?.replaceAccount)

    if (accountId) {
      const accountTrades = newTrades.filter((t) => t.account === accountId)
      setAccountProfiles((prev) => {
        const existing = prev.find((p) => p.id === accountId)
        const type = inferAccountType(accountTrades)
        let profile: AccountProfile = existing ?? {
          id: accountId,
          label: accountId,
          type,
          createdAt: new Date().toISOString(),
        }

        if (options?.accountFinancials) {
          profile = applyFinancialsToProfile(profile, options.accountFinancials)
        }

        if (cloudEnabled && userIdRef.current) {
          cloudWrite(() => upsertProfile(userIdRef.current!, profile))
        }

        if (existing) {
          return prev.map((p) => (p.id === accountId ? profile : p))
        }
        return [...prev, profile]
      })
    }

    let added = 0
    let skipped = 0

    setTrades((prev) => {
      if (isReplace && options?.replaceAccount) {
        const base = prev.filter((t) => t.account !== options.replaceAccount)
        added = newTrades.length
        return [...newTrades, ...base]
      }

      const { merged, added: a, skipped: s } = mergeTrades(prev, newTrades)
      added = a
      skipped = s
      return merged
    })

    if (cloudEnabled && userIdRef.current) {
      const uid = userIdRef.current
      cloudWrite(async () => {
        if (isReplace && options?.replaceAccount) {
          await deleteTradesByAccount(uid, options.replaceAccount)
          await upsertTrades(uid, newTrades)
        } else {
          await upsertTrades(uid, newTrades)
        }
      })
    }

    return { added, skipped, replaced: isReplace }
  }, [cloudEnabled, cloudWrite])

  const saveJournal = useCallback((input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString()
    let savedEntry: JournalEntry | null = null

    setJournal((prev) => {
      const existing = input.id
        ? prev.find((j) => j.id === input.id)
        : prev.find((j) => j.date === input.date && j.account === input.account)
      if (existing) {
        savedEntry = { ...existing, ...input, id: existing.id, updatedAt: now }
        return prev.map((j) => (j.id === existing.id ? savedEntry! : j))
      }
      savedEntry = {
        ...input,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }
      return [savedEntry, ...prev.filter((j) => !(j.date === input.date && j.account === input.account))]
    })

    if (cloudEnabled && userIdRef.current && savedEntry) {
      const entry = savedEntry
      cloudWrite(() => upsertJournal(userIdRef.current!, entry))
    }
  }, [cloudEnabled, cloudWrite])

  const deleteJournal = useCallback((id: string) => {
    setJournal((prev) => prev.filter((j) => j.id !== id))

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => deleteJournalCloud(userIdRef.current!, id))
    }
  }, [cloudEnabled, cloudWrite])

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

  if (cloudEnabled && !cloudReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-600">正在从云端同步数据…</p>
        </div>
      </div>
    )
  }

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
        syncStatus,
        cloudEnabled,
        refreshFromCloud: cloudEnabled ? refetchFromCloud : undefined,
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
