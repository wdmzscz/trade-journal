import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry, AccountProfile, AccountInfo, AccountScope, AccountType, PlaybookEntry, PaperAccountSettings } from '../types'
import { resolvePaperSettings } from '../types'
import { playbookOutcomeFromPnl } from '../types'
import { calculateTradePnl } from '../utils/stats'
import { buildAccountInfo, sumAccountScope, toAccountScope } from '../utils/accountTotals'
import { mergeTrades } from '../utils/storage'
import {
  applyCloudWithPending,
  cloudIdSetsFrom,
  emptyCloudIdSets,
  hasRecordsToPush,
  mergeChartLinks,
  recordsToPush,
  type CloudCollections,
  type CloudIdSets,
} from '../utils/cloudMerge'
import { mergeIbkrFinancials, type IbkrAccountFinancials } from '../utils/ibkrImport'
import { mergePlaybookChartSlots, normalizeChartLinks } from '../utils/chartLinks'
import { isCloudEnabled } from '../lib/supabase'
import {
  fetchAllData,
  uploadChangedData,
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
  deletePlaybookByAccount,
  subscribeToChanges,
} from '../lib/cloudSync'

const TRADES_KEY = 'trade-journal-trades'
const JOURNAL_KEY = 'trade-journal-journal'
const ACCOUNT_KEY = 'trade-journal-selected-account'
const ACCOUNT_ORDER_KEY = 'trade-journal-account-order'
const PROFILES_KEY = 'trade-journal-account-profiles'
const PLAYBOOK_KEY = 'trade-journal-playbook'
const PENDING_CREATES_KEY = 'trade-journal-pending-creates'
const PENDING_DELETES_KEY = 'trade-journal-pending-deletes'

function accountKey(userId?: string) {
  return userId ? `${ACCOUNT_KEY}-${userId}` : ACCOUNT_KEY
}

function scopedKey(base: string, userId?: string) {
  return userId ? `${base}-${userId}` : base
}

function loadCloudIdSets(key: string): CloudIdSets | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<Record<keyof CloudIdSets, string[]>>
    return {
      trades: new Set(parsed.trades ?? []),
      journal: new Set(parsed.journal ?? []),
      profiles: new Set(parsed.profiles ?? []),
      playbook: new Set(parsed.playbook ?? []),
    }
  } catch {
    return undefined
  }
}

function persistCloudIdSets(key: string, ids: CloudIdSets) {
  persistJson(key, {
    trades: [...ids.trades],
    journal: [...ids.journal],
    profiles: [...ids.profiles],
    playbook: [...ids.playbook],
  })
}

function loadPendingQueue(base: string, userId?: string): CloudIdSets {
  if (!userId) return emptyCloudIdSets()
  return loadCloudIdSets(scopedKey(base, userId)) ?? emptyCloudIdSets()
}

function persistPendingQueue(base: string, userId: string | undefined, ids: CloudIdSets) {
  if (!userId) return
  persistCloudIdSets(scopedKey(base, userId), ids)
}

function applyTradeToPlaybook(entry: PlaybookEntry, trade: Trade): PlaybookEntry {
  return {
    ...entry,
    symbol: trade.symbol,
    side: trade.side,
    account: trade.account,
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: trade.pnl,
    setup: trade.setup,
    outcome: playbookOutcomeFromPnl(trade.pnl) ?? entry.outcome,
    charts: trade.entryCharts?.length
      ? mergeChartLinks(entry.charts, trade.entryCharts)
      : entry.charts,
    updatedAt: trade.updatedAt,
  }
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

function uniqueAccountId(preferred: string, existing: Iterable<string>): string {
  const used = new Set(existing)
  const base = preferred.trim() || 'paper'
  if (base !== 'all' && !used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
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

function persistJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('写入本地缓存失败', key, err)
  }
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

const CLOUD_SYNC_TIMEOUT_MS = 15000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message))
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timeoutId)
        reject(err)
      }
    )
  })
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
  accountScope: AccountScope
  allAccountsScope: AccountScope
  setSelectedAccount: (account: string) => void
  accountProfiles: AccountProfile[]
  accountInfos: AccountInfo[]
  registerAccount: (id: string, label: string, type: AccountType, options?: { isPaper?: boolean }) => void
  updateAccount: (id: string, updates: {
    label?: string
    type?: AccountType
    isPaper?: boolean
    startingCapital?: number
    currentCapital?: number
    totalDeposits?: number
    paperSettings?: Partial<PaperAccountSettings>
  }) => void
  deleteAccount: (id: string) => void
  reorderAccounts: (fromId: string, toId: string) => void
  setAccountsOrder: (orderedIds: string[]) => void
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt' | 'pnl'> & { pnl?: number }) => string
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
  togglePlaybookPinned: (id: string) => void
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

  const [trades, setTrades] = useState<Trade[]>(loadTrades)
  const [journal, setJournal] = useState<JournalEntry[]>(loadJournal)
  const [accountProfiles, setAccountProfiles] = useState<AccountProfile[]>(loadProfiles)
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => loadSelectedAccount(userId))
  const [accountOrder, setAccountOrder] = useState<string[]>(() => loadAccountOrder(userId))
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>(loadPlaybook)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudEnabled ? 'loading' : 'idle')
  const [cloudReady, setCloudReady] = useState(!cloudEnabled)

  const tradesRef = useRef(trades)
  const journalRef = useRef(journal)
  const profilesRef = useRef(accountProfiles)
  const playbookRef = useRef(playbook)
  tradesRef.current = trades
  journalRef.current = journal
  profilesRef.current = accountProfiles
  playbookRef.current = playbook

  const reconcileQueuedRef = useRef(false)
  const reconcileRunningRef = useRef(false)
  const lastPushKeyRef = useRef('')
  const pendingDeletesRef = useRef<CloudIdSets>(loadPendingQueue(PENDING_DELETES_KEY, userId))
  const pendingCreatesRef = useRef<CloudIdSets>(loadPendingQueue(PENDING_CREATES_KEY, userId))

  const persistPendingQueues = useCallback(() => {
    persistPendingQueue(PENDING_DELETES_KEY, userIdRef.current, pendingDeletesRef.current)
    persistPendingQueue(PENDING_CREATES_KEY, userIdRef.current, pendingCreatesRef.current)
  }, [])

  const markPendingCreate = useCallback((collection: keyof CloudIdSets, id: string) => {
    pendingCreatesRef.current[collection].add(id)
    pendingDeletesRef.current[collection].delete(id)
    persistPendingQueues()
  }, [persistPendingQueues])

  const markPendingDelete = useCallback((collection: keyof CloudIdSets, id: string) => {
    pendingDeletesRef.current[collection].add(id)
    pendingCreatesRef.current[collection].delete(id)
    persistPendingQueues()
  }, [persistPendingQueues])

  const subtractConfirmedCreates = useCallback((cloudIds: CloudIdSets) => {
    let changed = false
    for (const collection of Object.keys(pendingCreatesRef.current) as (keyof CloudIdSets)[]) {
      for (const id of [...pendingCreatesRef.current[collection]]) {
        if (cloudIds[collection].has(id)) {
          pendingCreatesRef.current[collection].delete(id)
          changed = true
        }
      }
    }
    if (changed) persistPendingQueues()
  }, [persistPendingQueues])

  const clearResolvedDeletes = useCallback((cloudIds: CloudIdSets) => {
    let changed = false
    for (const collection of Object.keys(pendingDeletesRef.current) as (keyof CloudIdSets)[]) {
      for (const id of [...pendingDeletesRef.current[collection]]) {
        if (!cloudIds[collection].has(id)) {
          pendingDeletesRef.current[collection].delete(id)
          changed = true
        }
      }
    }
    if (changed) persistPendingQueues()
  }, [persistPendingQueues])

  const currentCollections = useCallback((): CloudCollections => ({
    trades: tradesRef.current,
    journal: journalRef.current,
    profiles: profilesRef.current,
    playbook: playbookRef.current,
  }), [])

  const applyData = useCallback((data: CloudCollections) => {
    tradesRef.current = data.trades
    journalRef.current = data.journal
    profilesRef.current = data.profiles
    playbookRef.current = data.playbook
    setTrades(data.trades)
    setJournal(data.journal)
    setAccountProfiles(data.profiles)
    setPlaybook(data.playbook)
    persistJson(TRADES_KEY, data.trades)
    persistJson(JOURNAL_KEY, data.journal)
    persistJson(PROFILES_KEY, data.profiles)
    persistJson(PLAYBOOK_KEY, data.playbook)
    setSelectedAccountState((current) => reconcileSelectedAccount(current, data.trades))
  }, [])

  const pushMissingToCloud = useCallback(async (
    userId: string,
    extras: ReturnType<typeof recordsToPush>
  ) => {
    if (!hasRecordsToPush(extras)) return
    const pushKey = [
      extras.playbook.map((item) => `${item.id}:${item.updatedAt}`).sort().join(','),
      extras.trades.map((item) => `${item.id}:${item.updatedAt}`).sort().join(','),
      extras.journal.map((item) => item.id).sort().join(','),
      extras.profiles.map((item) => item.id).sort().join(','),
    ].join('|')
    if (pushKey === lastPushKeyRef.current) return
    lastPushKeyRef.current = pushKey
    setSyncStatus('syncing')
    try {
      await uploadChangedData(userId, extras)
      setSyncStatus('idle')
    } catch (err) {
      lastPushKeyRef.current = ''
      console.warn('未确认的本机写入补传到云端失败', err)
      setSyncStatus('error')
      throw err
    }
  }, [])

  const flushPendingDeletes = useCallback(async (userId: string) => {
    const pending = pendingDeletesRef.current
    const tasks: Promise<void>[] = []
    pending.trades.forEach((id) => tasks.push(deleteTradeCloud(userId, id)))
    pending.journal.forEach((id) => tasks.push(deleteJournalCloud(userId, id)))
    pending.profiles.forEach((id) => tasks.push(deleteProfileCloud(userId, id)))
    pending.playbook.forEach((id) => tasks.push(deletePlaybookCloud(userId, id)))
    if (tasks.length === 0) return
    const results = await Promise.allSettled(tasks)
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('重试云端删除失败', result.reason)
      }
    }
  }, [])

  const reconcileToDatabase = useCallback(async (options?: {
    signal?: AbortSignal
    localOverride?: CloudCollections
  }) => {
    const userId = userIdRef.current
    if (!userId) return

    await flushPendingDeletes(userId)

    const local = options?.localOverride ?? currentCollections()
    const cloud = options?.signal
      ? await withTimeout(fetchAllData(userId, options.signal), CLOUD_SYNC_TIMEOUT_MS, '云端同步超时')
      : await fetchAllData(userId)

    const applied = applyCloudWithPending(
      cloud,
      local,
      pendingDeletesRef.current,
      pendingCreatesRef.current
    )
    applyData(applied)

    const extras = recordsToPush(applied, pendingCreatesRef.current)
    if (hasRecordsToPush(extras)) {
      await pushMissingToCloud(userId, extras)
    }

    const authoritative = options?.signal
      ? await withTimeout(fetchAllData(userId, options.signal), CLOUD_SYNC_TIMEOUT_MS, '云端同步超时')
      : await fetchAllData(userId)

    applyData(applyCloudWithPending(
      authoritative,
      currentCollections(),
      pendingDeletesRef.current,
      pendingCreatesRef.current
    ))
    subtractConfirmedCreates(cloudIdSetsFrom(authoritative))
    clearResolvedDeletes(cloudIdSetsFrom(authoritative))
    setSyncStatus('idle')
  }, [
    applyData,
    clearResolvedDeletes,
    currentCollections,
    flushPendingDeletes,
    pushMissingToCloud,
    subtractConfirmedCreates,
  ])

  const refetchFromCloud = useCallback(async () => {
    if (!userIdRef.current) return
    if (reconcileRunningRef.current) {
      reconcileQueuedRef.current = true
      return
    }
    reconcileRunningRef.current = true
    try {
      do {
        reconcileQueuedRef.current = false
        await reconcileToDatabase()
      } while (reconcileQueuedRef.current)
    } catch {
      setSyncStatus('error')
    } finally {
      reconcileRunningRef.current = false
    }
  }, [reconcileToDatabase])

  useEffect(() => {
    if (!cloudEnabled || !userId) return

    let cancelled = false
    const controller = new AbortController()

    async function init() {
      setSyncStatus('loading')
      const local = {
        trades: loadTrades(),
        journal: loadJournal(),
        profiles: loadProfiles(),
        playbook: loadPlaybook(),
      }
      try {
        // 等 auth lock 释放后再打 PostgREST，避免首次打开永久挂起
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0)
        })
        if (cancelled) return

        reconcileRunningRef.current = true
        await reconcileToDatabase({ signal: controller.signal, localOverride: local })
        if (!cancelled) setCloudReady(true)
      } catch (err) {
        if (cancelled) return
        console.warn('云端同步失败，改用本地缓存', err)
        applyData(local)
        setSyncStatus('error')
        setCloudReady(true)
      } finally {
        reconcileRunningRef.current = false
      }
    }

    void init()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [applyData, cloudEnabled, reconcileToDatabase, userId])

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
    persistJson(TRADES_KEY, trades)
  }, [trades, cloudReady])

  useEffect(() => {
    if (!cloudReady) return
    persistJson(JOURNAL_KEY, journal)
  }, [journal, cloudReady])

  useEffect(() => {
    if (!cloudReady) return
    persistJson(PROFILES_KEY, accountProfiles)
  }, [accountProfiles, cloudReady])

  useEffect(() => {
    try {
      localStorage.setItem(accountKey(userId), selectedAccount)
    } catch {
      /* ignore */
    }
  }, [selectedAccount, userId])

  useEffect(() => {
    persistJson(PLAYBOOK_KEY, playbook)
  }, [playbook])

  useEffect(() => {
    persistJson(accountOrderKey(userId), accountOrder)
  }, [accountOrder, userId])

  const cloudWrite = useCallback(async (fn: () => Promise<void>) => {
    if (!cloudEnabled || !userIdRef.current) return
    setSyncStatus('syncing')
    try {
      await fn()
      setSyncStatus('idle')
    } catch (err) {
      console.warn('云端写入失败', err)
      setSyncStatus('error')
    }
  }, [cloudEnabled])

  const setSelectedAccount = useCallback((account: string) => {
    setSelectedAccountState(account)
  }, [])

  const registerAccount = useCallback((id: string, label: string, type: AccountType, options?: { isPaper?: boolean }) => {
    const trimmedLabel = label.trim()
    const isPaper = Boolean(options?.isPaper)
    if (isPaper && !trimmedLabel) return

    let trimmedId = id.trim()
    if (!trimmedId) {
      if (!isPaper) return
      trimmedId = uniqueAccountId(trimmedLabel, collectAccountIds(trades, accountProfiles))
    }

    const now = new Date().toISOString()
    let isNew = false

    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === trimmedId)
      let profile: AccountProfile
      if (existing) {
        profile = {
          ...existing,
          label: trimmedLabel || trimmedId,
          type,
          isPaper: options?.isPaper ?? existing.isPaper,
        }
      } else {
        isNew = true
        profile = {
          id: trimmedId,
          label: trimmedLabel || trimmedId,
          type,
          isPaper: isPaper,
          createdAt: now,
          ...(isPaper
            ? {
                startingCapital: 50000,
                totalDeposits: 50000,
                currentCapital: 50000,
                paperSettings: resolvePaperSettings(),
              }
            : {}),
        }
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
      markPendingCreate('profiles', trimmedId)
      setAccountOrder((order) => (order.includes(trimmedId) ? order : [...order, trimmedId]))
    }
    setSelectedAccountState(trimmedId)
  }, [accountProfiles, cloudEnabled, cloudWrite, markPendingCreate, trades])

  const updateAccount = useCallback((id: string, updates: {
    label?: string
    type?: AccountType
    isPaper?: boolean
    startingCapital?: number
    currentCapital?: number
    totalDeposits?: number
    paperSettings?: Partial<PaperAccountSettings>
  }) => {
    setAccountProfiles((prev) => {
      const existing = prev.find((p) => p.id === id)
      let profile: AccountProfile
      if (existing) {
        profile = {
          ...existing,
          label: updates.label !== undefined ? updates.label.trim() || id : existing.label,
          type: updates.type ?? existing.type,
          isPaper: updates.isPaper !== undefined ? updates.isPaper : existing.isPaper,
          startingCapital: updates.startingCapital !== undefined
            ? updates.startingCapital
            : existing.startingCapital,
          currentCapital: updates.currentCapital !== undefined
            ? updates.currentCapital
            : existing.currentCapital,
          totalDeposits: updates.totalDeposits !== undefined
            ? updates.totalDeposits
            : existing.totalDeposits,
          paperSettings: updates.paperSettings
            ? resolvePaperSettings({ ...existing.paperSettings, ...updates.paperSettings })
            : existing.paperSettings,
        }
      } else {
        profile = {
          id,
          label: updates.label?.trim() || id,
          type: updates.type ?? inferAccountType(trades.filter((t) => t.account === id)),
          isPaper: Boolean(updates.isPaper),
          createdAt: new Date().toISOString(),
          startingCapital: updates.startingCapital,
          currentCapital: updates.currentCapital,
          totalDeposits: updates.totalDeposits,
          paperSettings: updates.paperSettings
            ? resolvePaperSettings(updates.paperSettings)
            : undefined,
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
    markPendingCreate('profiles', id)
  }, [cloudEnabled, cloudWrite, markPendingCreate, trades])

  const deleteAccount = useCallback((id: string) => {
    markPendingDelete('profiles', id)
    setAccountProfiles((prev) => prev.filter((p) => p.id !== id))
    setAccountOrder((prev) => prev.filter((accountId) => accountId !== id))
    setTrades((prev) => {
      prev.filter((t) => t.account === id).forEach((t) => markPendingDelete('trades', t.id))
      return prev.filter((t) => t.account !== id)
    })
    setJournal((prev) => {
      prev.filter((j) => j.account === id).forEach((j) => markPendingDelete('journal', j.id))
      return prev.filter((j) => j.account !== id)
    })
    setPlaybook((prev) => {
      prev.filter((p) => p.account === id).forEach((p) => markPendingDelete('playbook', p.id))
      return prev.filter((p) => p.account !== id)
    })
    setSelectedAccountState((current) => (current === id ? 'all' : current))

    if (cloudEnabled && userIdRef.current) {
      const uid = userIdRef.current
      cloudWrite(async () => {
        await deleteProfileCloud(uid, id)
        await deleteTradesByAccount(uid, id)
        await deleteJournalByAccount(uid, id)
        await deletePlaybookByAccount(uid, id)
      })
    }
  }, [cloudEnabled, cloudWrite, markPendingDelete])

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

  const paperAccountIds = useMemo(() => {
    return new Set(accountProfiles.filter((p) => p.isPaper).map((p) => p.id))
  }, [accountProfiles])

  const filteredTrades = useMemo(() => {
    if (selectedAccount === 'all') {
      // 「全部」只汇总实盘，Paper 账户需点进该账户查看
      return trades.filter((t) => !paperAccountIds.has(t.account))
    }
    return trades.filter((t) => t.account === selectedAccount)
  }, [trades, selectedAccount, paperAccountIds])

  const filteredJournal = useMemo(() => {
    if (selectedAccount === 'all') {
      return journal.filter((j) => !paperAccountIds.has(j.account))
    }
    return journal.filter((j) => j.account === selectedAccount)
  }, [journal, selectedAccount, paperAccountIds])

  const filteredPlaybook = useMemo(() => {
    if (selectedAccount === 'all') {
      return playbook.filter((p) => !paperAccountIds.has(p.account))
    }
    return playbook.filter((p) => p.account === selectedAccount)
  }, [playbook, selectedAccount, paperAccountIds])

  const accounts = useMemo(() => {
    const rawIds = collectAccountIds(trades, accountProfiles)
    return applyAccountOrder(rawIds, accountOrder)
  }, [trades, accountProfiles, accountOrder])

  const accountInfos = useMemo((): AccountInfo[] => {
    return accounts.map((id) =>
      buildAccountInfo(
        id,
        trades,
        accountProfiles.find((profile) => profile.id === id),
        inferAccountType,
      )
    )
  }, [accounts, accountProfiles, trades])

  const selectedAccountInfo = useMemo(() => {
    if (selectedAccount === 'all') return null
    return accountInfos.find((a) => a.id === selectedAccount) ?? null
  }, [selectedAccount, accountInfos])

  const allAccountsScope = useMemo(
    () =>
      sumAccountScope(
        accountInfos.filter((account) => !account.isPaper),
        { id: 'all', label: '全部账户', isAll: true, isPaper: false },
      ),
    [accountInfos]
  )

  const accountScope = useMemo((): AccountScope => {
    if (selectedAccount === 'all' || !selectedAccountInfo) return allAccountsScope
    return toAccountScope(selectedAccountInfo)
  }, [selectedAccount, selectedAccountInfo, allAccountsScope])

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
    markPendingCreate('trades', trade.id)

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => upsertTrade(userIdRef.current!, trade))
    }
    return trade.id
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const updateTrade = useCallback((id: string, updates: Partial<Trade>) => {
    let mergedTrade: Trade | null = null
    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const merged = { ...t, ...updates, updatedAt: new Date().toISOString() }
        const priceTouched = (
          ['side', 'entryPrice', 'exitPrice', 'quantity', 'fees', 'status'] as const
        ).some((key) => key in updates)

        if (updates.pnl !== undefined) {
          merged.pnl = updates.pnl
        } else if (priceTouched) {
          merged.pnl = computePnl(merged)
        }

        mergedTrade = merged
        return merged
      })
    )

    const linked = mergedTrade
      ? playbookRef.current.filter((entry) =>
          entry.tradeId === id || entry.id === mergedTrade!.playbookId
        )
      : []
    const syncedPlaybook = linked.map((entry) => applyTradeToPlaybook(entry, mergedTrade!))
    if (syncedPlaybook.length > 0) {
      setPlaybook((prev) => {
        const next = prev.map((entry) => syncedPlaybook.find((item) => item.id === entry.id) ?? entry)
        persistJson(PLAYBOOK_KEY, next)
        return next
      })
    }

    markPendingCreate('trades', id)
    syncedPlaybook.forEach((entry) => markPendingCreate('playbook', entry.id))

    if (cloudEnabled && userIdRef.current && mergedTrade) {
      const trade = mergedTrade
      const cases = syncedPlaybook
      cloudWrite(async () => {
        await upsertTrade(userIdRef.current!, trade)
        for (const entry of cases) {
          await upsertPlaybookEntry(userIdRef.current!, entry)
        }
      })
    }
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const deleteTrade = useCallback((id: string) => {
    const trade = tradesRef.current.find((item) => item.id === id)
    const playbookIds = new Set<string>()
    if (trade?.playbookId) playbookIds.add(trade.playbookId)
    playbookRef.current.forEach((entry) => {
      if (entry.tradeId === id) playbookIds.add(entry.id)
    })

    markPendingDelete('trades', id)
    playbookIds.forEach((playbookId) => markPendingDelete('playbook', playbookId))
    setTrades((prev) => prev.filter((item) => item.id !== id))
    if (playbookIds.size > 0) {
      setPlaybook((prev) => prev.filter((entry) => !playbookIds.has(entry.id)))
    }

    if (cloudEnabled && userIdRef.current) {
      const ids = [...playbookIds]
      cloudWrite(async () => {
        await deleteTradeCloud(userIdRef.current!, id)
        for (const playbookId of ids) {
          await deletePlaybookCloud(userIdRef.current!, playbookId)
        }
      })
    }
  }, [cloudEnabled, cloudWrite, markPendingDelete])

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

    newTrades.forEach((trade) => markPendingCreate('trades', trade.id))
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
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const saveJournal = useCallback((input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString()
    let savedEntry: JournalEntry | undefined

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

    if (savedEntry) markPendingCreate('journal', savedEntry.id)

    if (cloudEnabled && userIdRef.current && savedEntry) {
      const entry = savedEntry
      cloudWrite(() => upsertJournal(userIdRef.current!, entry))
    }
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const deleteJournal = useCallback((id: string) => {
    markPendingDelete('journal', id)
    setJournal((prev) => prev.filter((j) => j.id !== id))

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => deleteJournalCloud(userIdRef.current!, id))
    }
  }, [cloudEnabled, cloudWrite, markPendingDelete])

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
    const existing = input.id ? playbookRef.current.find((p) => p.id === input.id) : undefined
    const entry: PlaybookEntry = {
      ...input,
      id: existing?.id ?? uuidv4(),
      charts: normalizeChartLinks(input.charts),
      outcome: input.outcome ?? existing?.outcome ?? playbookOutcomeFromPnl(input.pnl),
      pinned: input.pinned ?? existing?.pinned ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    markPendingCreate('playbook', entry.id)

    setPlaybook((prev) => {
      const next = prev.some((p) => p.id === entry.id)
        ? prev.map((p) => (p.id === entry.id ? entry : p))
        : [entry, ...prev]
      persistJson(PLAYBOOK_KEY, next)
      return next
    })

    let linkedTrade: Trade | null = null
    if (entry.tradeId) {
      const tradeId = entry.tradeId
      markPendingCreate('trades', tradeId)
      setTrades((current) => {
        const next = current.map((t) => {
          if (t.id !== tradeId) return t
          linkedTrade = {
            ...t,
            playbookId: entry.id,
            entryCharts: entry.charts.length > 0 ? entry.charts : t.entryCharts,
            updatedAt: now,
          }
          return linkedTrade
        })
        persistJson(TRADES_KEY, next)
        return next
      })
    }

    if (cloudEnabled && userIdRef.current) {
      const trade = linkedTrade
      cloudWrite(async () => {
        await upsertPlaybookEntry(userIdRef.current!, entry)
        if (trade) await upsertTrade(userIdRef.current!, trade)
      })
    }
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const deletePlaybookEntry = useCallback((id: string) => {
    const entry = playbookRef.current.find((item) => item.id === id)
    const linkedTrade = entry?.tradeId
      ? tradesRef.current.find((trade) => trade.id === entry.tradeId)
      : tradesRef.current.find((trade) => trade.playbookId === id)
    const linkedIsPaper = Boolean(
      linkedTrade && profilesRef.current.find((profile) => profile.id === linkedTrade.account)?.isPaper
    )

    markPendingDelete('playbook', id)
    setPlaybook((prev) => prev.filter((item) => item.id !== id))

    if (linkedTrade && linkedIsPaper) {
      markPendingDelete('trades', linkedTrade.id)
      setTrades((prev) => prev.filter((trade) => trade.id !== linkedTrade.id))
    } else {
      setTrades((prev) =>
        prev.map((trade) =>
          trade.playbookId === id
            ? { ...trade, playbookId: undefined, updatedAt: new Date().toISOString() }
            : trade
        )
      )
    }

    if (cloudEnabled && userIdRef.current) {
      const tradeId = linkedTrade && linkedIsPaper ? linkedTrade.id : undefined
      cloudWrite(async () => {
        await deletePlaybookCloud(userIdRef.current!, id)
        if (tradeId) await deleteTradeCloud(userIdRef.current!, tradeId)
      })
    }
  }, [cloudEnabled, cloudWrite, markPendingDelete])

  const togglePlaybookPinned = useCallback((id: string) => {
    const now = new Date().toISOString()
    let savedEntry: PlaybookEntry | null = null

    setPlaybook((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry
        savedEntry = { ...entry, pinned: !entry.pinned, updatedAt: now }
        return savedEntry
      })
    )

    markPendingCreate('playbook', id)

    if (cloudEnabled && userIdRef.current && savedEntry) {
      const entry = savedEntry
      cloudWrite(() => upsertPlaybookEntry(userIdRef.current!, entry))
    }
  }, [cloudEnabled, cloudWrite, markPendingCreate])

  const createPlaybookFromTrade = useCallback((tradeId: string) => {
    const trade = trades.find((t) => t.id === tradeId)
    if (!trade) return null
    if (playbook.some((p) => p.tradeId === tradeId)) {
      return playbook.find((p) => p.tradeId === tradeId)?.id ?? null
    }

    const now = new Date().toISOString()
    const entryCharts = normalizeChartLinks(trade.entryCharts)
    const charts = normalizeChartLinks(
      entryCharts.length > 0
        ? mergePlaybookChartSlots([
            { timeframe: 'E', url: entryCharts[0]?.url ?? '', note: entryCharts[0]?.note },
            ...entryCharts.slice(1),
          ])
        : []
    )

    const outcome = playbookOutcomeFromPnl(trade.pnl) ?? 'breakeven'
    const caseLabel = outcome === 'win' ? '盈利案例' : outcome === 'loss' ? '亏损案例' : '持平案例'

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
      outcome,
      setup: trade.setup,
      title: `${trade.symbol} ${trade.setup ?? caseLabel}`,
      thesis: trade.notes,
      journalDate: trade.entryDate.slice(0, 10),
      charts,
      tags: [...trade.tags, 'playbook', outcome],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }

    markPendingCreate('playbook', entry.id)
    markPendingCreate('trades', tradeId)
    setPlaybook((prev) => {
      const next = [entry, ...prev]
      persistJson(PLAYBOOK_KEY, next)
      return next
    })
    let linkedTrade: Trade | null = null
    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== tradeId) return t
        linkedTrade = { ...t, playbookId: entry.id, updatedAt: now }
        return linkedTrade
      })
    )

    if (cloudEnabled && userIdRef.current) {
      const trade = linkedTrade
      cloudWrite(async () => {
        await upsertPlaybookEntry(userIdRef.current!, entry)
        if (trade) await upsertTrade(userIdRef.current!, trade)
      })
    }
    return entry.id
  }, [trades, playbook, cloudEnabled, cloudWrite, markPendingCreate])

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
        accountScope,
        allAccountsScope,
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
        togglePlaybookPinned,
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
