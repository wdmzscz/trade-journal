import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry, AccountProfile, AccountInfo, AccountType, PlaybookEntry } from '../types'
import { calculateTradePnl, resolveStartingCapital } from '../utils/stats'
import { mergeTrades } from '../utils/storage'
import { mergeIbkrFinancials, type IbkrAccountFinancials } from '../utils/ibkrImport'
import { mergePlaybookChartSlots, normalizeChartLinks } from '../utils/chartLinks'
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
  upsertPlaybookEntry,
  deletePlaybookCloud,
  subscribeToChanges,
} from '../lib/cloudSync'

const TRADES_KEY = 'trade-journal-trades'
const JOURNAL_KEY = 'trade-journal-journal'
const ACCOUNT_KEY = 'trade-journal-selected-account'
const ACCOUNT_ORDER_KEY = 'trade-journal-account-order'
const PROFILES_KEY = 'trade-journal-account-profiles'
const PLAYBOOK_KEY = 'trade-journal-playbook'

function accountKey(userId?: string) {
  return userId ? `${ACCOUNT_KEY}-${userId}` : ACCOUNT_KEY
}

function accountOrderKey(userId?: string) {
  return userId ? `${ACCOUNT_ORDER_KEY}-${userId}` : ACCOUNT_ORDER_KEY
}

function loadAccountOrder(userId?: string): string[] {
  try {
    const raw = localStorage.getItem(accountOrderKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function collectAccountIds(trades: Trade[], accountProfiles: AccountProfile[]): string[] {
  const ids = new Set<string>()
  accountProfiles.forEach((p) => ids.add(p.id))
  trades.forEach((t) => ids.add(t.account))
  const hasRealIbkrData = trades.some((t) => t.account !== 'IBKR')
  return [...ids].filter((id) => {
    if (id !== 'IBKR' || !hasRealIbkrData) return true
    return trades.some((t) => t.account === 'IBKR')
  })
}

function applyAccountOrder(allIds: string[], savedOrder: string[]): string[] {
  const idSet = new Set(allIds)
  const ordered: string[] = []
  for (const id of savedOrder) {
    if (idSet.has(id)) ordered.push(id)
  }
  for (const id of allIds) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered
}

function reorderAccountIds(order: string[], fromId: string, toId: string): string[] {
  const fromIdx = order.indexOf(fromId)
  const toIdx = order.indexOf(toId)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return order
  const next = [...order]
  next.splice(fromIdx, 1)
  next.splice(toIdx, 0, fromId)
  return next
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

function loadPlaybook(): PlaybookEntry[] {
  try {
    const raw = localStorage.getItem(PLAYBOOK_KEY)
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

function reconcileSelectedAccount(selected: string, trades: Trade[]): string {
  if (selected === 'all') return 'all'
  if (trades.some((t) => t.account === selected)) return selected

  const counts = new Map<string, number>()
  for (const trade of trades) {
    counts.set(trade.account, (counts.get(trade.account) ?? 0) + 1)
  }

  let bestAccount = ''
  let bestCount = 0
  for (const [accountId, count] of counts) {
    if (count > bestCount) {
      bestAccount = accountId
      bestCount = count
    }
  }

  return bestCount > 0 ? bestAccount : 'all'
}

function inferAccountType(trades: Trade[]): AccountType {
  const futures = trades.filter((t) => t.assetClass === 'futures').length
  const stocks = trades.filter((t) => t.assetClass === 'stock').length
  if (futures > stocks) return 'futures'
  if (stocks > futures) return 'stock'
  return 'other'
}

function applyFinancialsToProfile(
  profile: AccountProfile,
  financials: IbkrAccountFinancials
): AccountProfile {
  const merged = mergeIbkrFinancials(
    {
      startingCapital: profile.startingCapital ?? 0,
      currentCapital: profile.currentCapital ?? 0,
      totalDeposits: profile.totalDeposits ?? 0,
      totalWithdrawals: profile.totalWithdrawals ?? 0,
      cashFlows: profile.cashFlows ?? [],
      navHistory: profile.navHistory ?? [],
    },
    financials
  )
  return {
    ...profile,
    startingCapital: merged.startingCapital,
    currentCapital: merged.currentCapital,
    totalDeposits: merged.totalDeposits,
    totalWithdrawals: merged.totalWithdrawals,
    cashFlows: merged.cashFlows,
    navHistory: merged.navHistory,
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
    totalDeposits?: number
  }) => void
  deleteAccount: (id: string) => void
  reorderAccounts: (fromId: string, toId: string) => void
  setAccountsOrder: (orderedIds: string[]) => void
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  importTrades: (trades: Trade[], options?: {
    replaceAccount?: string
    accountFinancials?: IbkrAccountFinancials
    accountFinancialsMap?: Record<string, IbkrAccountFinancials>
    accountLabel?: string
    accountLabels?: Record<string, string>
  }) => { added: number; skipped: number; replaced: boolean }
  saveJournal: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
  deleteJournal: (id: string) => void
  getJournalByDate: (date: string) => JournalEntry | undefined
  playbook: PlaybookEntry[]
  filteredPlaybook: PlaybookEntry[]
  savePlaybookEntry: (entry: Omit<PlaybookEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
  deletePlaybookEntry: (id: string) => void
  createPlaybookFromTrade: (tradeId: string) => string | null
  isTradeInPlaybook: (tradeId: string) => boolean
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
  const [accountOrder, setAccountOrder] = useState<string[]>(() => loadAccountOrder(userId))
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>(() => (cloudEnabled ? [] : loadPlaybook()))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudEnabled ? 'loading' : 'idle')
  const [cloudReady, setCloudReady] = useState(!cloudEnabled)

  const refetchFromCloud = useCallback(async () => {
    if (!userIdRef.current) return
    try {
      const data = await fetchAllData(userIdRef.current)
      setTrades(data.trades)
      setJournal(data.journal)
      setAccountProfiles(data.profiles)
      setPlaybook(data.playbook)
      setSelectedAccountState((current) => reconcileSelectedAccount(current, data.trades))
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

        if (data.trades.length === 0 && data.journal.length === 0 && data.profiles.length === 0 && data.playbook.length === 0) {
          const localTrades = loadTrades()
          const localJournal = loadJournal()
          const localProfiles = loadProfiles()
          const localPlaybook = loadPlaybook()
          if (localTrades.length > 0 || localJournal.length > 0 || localProfiles.length > 0 || localPlaybook.length > 0) {
            await uploadAllData(userId!, {
              trades: localTrades,
              journal: localJournal,
              profiles: localProfiles,
              playbook: localPlaybook,
            })
            data = { trades: localTrades, journal: localJournal, profiles: localProfiles, playbook: localPlaybook }
          }
        }

        if (!cancelled) {
          setTrades(data.trades)
          setJournal(data.journal)
          setAccountProfiles(data.profiles)
          setPlaybook(data.playbook)
          setSelectedAccountState((current) => reconcileSelectedAccount(current, data.trades))
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

  useEffect(() => {
    if (!cloudReady) return
    localStorage.setItem(PLAYBOOK_KEY, JSON.stringify(playbook))
  }, [playbook, cloudReady])

  useEffect(() => {
    localStorage.setItem(accountOrderKey(userId), JSON.stringify(accountOrder))
  }, [accountOrder, userId])

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
    let isNew = false

    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === trimmedId)
      let profile: AccountProfile
      if (existing) {
        profile = { ...existing, label: label.trim() || trimmedId, type }
      } else {
        isNew = true
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

    if (isNew) {
      setAccountOrder((order) => (order.includes(trimmedId) ? order : [...order, trimmedId]))
    }
    setSelectedAccountState(trimmedId)
  }, [cloudEnabled, cloudWrite])

  const updateAccount = useCallback((id: string, updates: {
    label?: string
    type?: AccountType
    startingCapital?: number
    currentCapital?: number
    totalDeposits?: number
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
          totalDeposits: updates.totalDeposits ?? existing.totalDeposits,
        }
      } else {
        profile = {
          id,
          label: updates.label?.trim() || id,
          type: updates.type ?? inferAccountType(trades.filter((t) => t.account === id)),
          createdAt: new Date().toISOString(),
          startingCapital: updates.startingCapital,
          currentCapital: updates.currentCapital,
          totalDeposits: updates.totalDeposits,
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
    setAccountOrder((prev) => prev.filter((accountId) => accountId !== id))
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

  const reorderAccounts = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return
    setAccountOrder((prev) => {
      const rawIds = collectAccountIds(trades, accountProfiles)
      const merged = applyAccountOrder(rawIds, prev)
      return reorderAccountIds(merged, fromId, toId)
    })
  }, [trades, accountProfiles])

  const setAccountsOrder = useCallback((orderedIds: string[]) => {
    const rawIds = collectAccountIds(trades, accountProfiles)
    const idSet = new Set(rawIds)
    const next = orderedIds.filter((id) => idSet.has(id))
    for (const id of rawIds) {
      if (!next.includes(id)) next.push(id)
    }
    setAccountOrder(next)
  }, [trades, accountProfiles])

  const filteredTrades = useMemo(() => {
    if (selectedAccount === 'all') return trades
    return trades.filter((t) => t.account === selectedAccount)
  }, [trades, selectedAccount])

  const filteredJournal = useMemo(() => {
    if (selectedAccount === 'all') return journal
    return journal.filter((j) => j.account === selectedAccount)
  }, [journal, selectedAccount])

  const filteredPlaybook = useMemo(() => {
    if (selectedAccount === 'all') return playbook
    return playbook.filter((p) => p.account === selectedAccount)
  }, [playbook, selectedAccount])

  const accounts = useMemo(() => {
    const rawIds = collectAccountIds(trades, accountProfiles)
    return applyAccountOrder(rawIds, accountOrder)
  }, [trades, accountProfiles, accountOrder])

  const accountInfos = useMemo((): AccountInfo[] => {
    return accounts.map((id) => {
      const profile = accountProfiles.find((p) => p.id === id)
      const accountTrades = trades.filter((t) => t.account === id)
      const closed = accountTrades.filter((t) => t.status === 'closed')
      const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0)
      const startingCapital = resolveStartingCapital(
        profile?.startingCapital ?? 0,
        profile?.totalDeposits
      )
      return {
        id,
        label: profile?.label ?? id,
        type: profile?.type ?? inferAccountType(accountTrades),
        tradeCount: accountTrades.length,
        totalPnl,
        startingCapital: startingCapital > 0 ? startingCapital : profile?.startingCapital,
        currentCapital: profile?.currentCapital,
        totalDeposits: profile?.totalDeposits,
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
    accountFinancialsMap?: Record<string, IbkrAccountFinancials>
    accountLabel?: string
    accountLabels?: Record<string, string>
  }) => {
    const accountId = options?.replaceAccount ?? newTrades[0]?.account
    const isReplace = Boolean(options?.replaceAccount)
    const touchedAccounts = [...new Set(newTrades.map((t) => t.account))]

    if (touchedAccounts.length > 0) {
      setAccountProfiles((prev) => {
        let next = [...prev]
        for (const touchedId of touchedAccounts) {
          const accountTrades = newTrades.filter((t) => t.account === touchedId)
          const financials =
            options?.accountFinancialsMap?.[touchedId] ??
            (touchedId === accountId ? options?.accountFinancials : undefined)
          const label =
            options?.accountLabels?.[touchedId] ??
            (touchedId === accountId ? options?.accountLabel : undefined)

          const existing = next.find((p) => p.id === touchedId)
          const type = inferAccountType(accountTrades)
          const resolvedLabel =
            existing?.label && existing.label !== touchedId
              ? existing.label
              : (label ?? (touchedId === accountId ? 'IBKR' : touchedId))
          let profile: AccountProfile = existing ?? {
            id: touchedId,
            label: resolvedLabel,
            type,
            createdAt: new Date().toISOString(),
          }
          if (!existing) {
            profile.label = resolvedLabel
          }
          if (financials) {
            profile = applyFinancialsToProfile(profile, financials)
          }
          if (cloudEnabled && userIdRef.current) {
            cloudWrite(() => upsertProfile(userIdRef.current!, profile))
          }
          if (existing) {
            next = next.map((p) => (p.id === touchedId ? profile : p))
          } else {
            next = [...next, profile]
          }
        }
        return next
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
    (date: string) => {
      if (selectedAccount === 'all') {
        return journal.find((j) => j.date === date)
      }
      return journal.find((j) => j.date === date && j.account === selectedAccount)
    },
    [journal, selectedAccount]
  )

  const isTradeInPlaybook = useCallback(
    (tradeId: string) => playbook.some((p) => p.tradeId === tradeId),
    [playbook]
  )

  const savePlaybookEntry = useCallback((input: Omit<PlaybookEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString()
    let savedEntry: PlaybookEntry | null = null

    setPlaybook((prev) => {
      const existing = input.id ? prev.find((p) => p.id === input.id) : undefined
      const entry: PlaybookEntry = {
        ...input,
        id: existing?.id ?? uuidv4(),
        charts: normalizeChartLinks(input.charts),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      savedEntry = entry

      if (entry.tradeId) {
        setTrades((trades) =>
          trades.map((t) => (t.id === entry.tradeId ? { ...t, playbookId: entry.id, updatedAt: now } : t))
        )
      }

      if (existing) {
        return prev.map((p) => (p.id === existing.id ? entry : p))
      }
      return [entry, ...prev]
    })

    if (cloudEnabled && userIdRef.current && savedEntry) {
      const entry = savedEntry
      cloudWrite(() => upsertPlaybookEntry(userIdRef.current!, entry))
    }
  }, [cloudEnabled, cloudWrite])

  const deletePlaybookEntry = useCallback((id: string) => {
    setPlaybook((prev) => prev.filter((p) => p.id !== id))
    setTrades((prev) =>
      prev.map((t) => (t.playbookId === id ? { ...t, playbookId: undefined, updatedAt: new Date().toISOString() } : t))
    )

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => deletePlaybookCloud(userIdRef.current!, id))
    }
  }, [cloudEnabled, cloudWrite])

  const createPlaybookFromTrade = useCallback((tradeId: string) => {
    const trade = trades.find((t) => t.id === tradeId)
    if (!trade) return null
    if (playbook.some((p) => p.tradeId === tradeId)) {
      return playbook.find((p) => p.tradeId === tradeId)?.id ?? null
    }

    const now = new Date().toISOString()
    const entryCharts = normalizeChartLinks(trade.entryCharts)
    const charts = entryCharts.length > 0
      ? mergePlaybookChartSlots([
          { timeframe: 'E', url: entryCharts[0]?.url ?? '', note: entryCharts[0]?.note },
          ...entryCharts.slice(1),
        ])
      : mergePlaybookChartSlots()

    const entry: PlaybookEntry = {
      id: uuidv4(),
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      account: trade.account,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      setup: trade.setup,
      title: `${trade.symbol} ${trade.setup ?? '盈利案例'}`,
      thesis: trade.notes,
      journalDate: trade.entryDate.slice(0, 10),
      charts,
      tags: [...trade.tags, 'playbook'],
      createdAt: now,
      updatedAt: now,
    }

    setPlaybook((prev) => [entry, ...prev])
    setTrades((prev) =>
      prev.map((t) => (t.id === tradeId ? { ...t, playbookId: entry.id, updatedAt: now } : t))
    )

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => upsertPlaybookEntry(userIdRef.current!, entry))
    }
    return entry.id
  }, [trades, playbook, cloudEnabled, cloudWrite])

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
        reorderAccounts,
        setAccountsOrder,
        addTrade,
        updateTrade,
        deleteTrade,
        importTrades,
        saveJournal,
        deleteJournal,
        getJournalByDate,
        playbook,
        filteredPlaybook,
        savePlaybookEntry,
        deletePlaybookEntry,
        createPlaybookFromTrade,
        isTradeInPlaybook,
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
