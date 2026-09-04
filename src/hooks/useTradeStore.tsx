import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, JournalEntry, AccountProfile, AccountInfo, AccountScope, AccountType, PlaybookEntry, PaperAccountSettings } from '../types'
import { resolvePaperSettings } from '../types'
import { playbookOutcomeFromPnl } from '../types'
import { calculateTradePnl } from '../utils/stats'
import { buildAccountInfo, sumAccountScope, toAccountScope } from '../utils/accountTotals'
import { mergeTrades } from '../utils/storage'
import {
  cloudIdSetsFrom,
  countValidChartLinks,
  hasRecordsToPush,
  mergeAndDedupeCloudCollections,
  overlayUnconfirmedLocal,
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

  const previousCloudIdsRef = useRef<CloudIdSets | undefined>(undefined)
  const lastAppliedCloudRef = useRef<CloudCollections | null>(null)
  const sourceOfTruthReadyRef = useRef(false)
  const reconcileQueuedRef = useRef(false)
  const reconcileRunningRef = useRef(false)
  const lastPushKeyRef = useRef('')
  const pendingDeletesRef = useRef<CloudIdSets>({
    trades: new Set(),
    journal: new Set(),
    profiles: new Set(),
    playbook: new Set(),
  })

  const currentCollections = useCallback((): CloudCollections => ({
    trades: tradesRef.current,
    journal: journalRef.current,
    profiles: profilesRef.current,
    playbook: playbookRef.current,
  }), [])

  const applyData = useCallback((data: CloudCollections) => {
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
    extras: ReturnType<typeof recordsToPush>,
    droppedPlaybookIds: string[] = []
  ) => {
    if (!hasRecordsToPush(extras) && droppedPlaybookIds.length === 0) return
    const pushKey = [
      extras.playbook.map((item) => `${item.id}:${item.updatedAt}`).sort().join(','),
      extras.trades.map((item) => `${item.id}:${item.updatedAt}:${countValidChartLinks(item.entryCharts)}`).sort().join(','),
      extras.journal.map((item) => item.id).sort().join(','),
      extras.profiles.map((item) => item.id).sort().join(','),
      droppedPlaybookIds.slice().sort().join(','),
    ].join('|')
    if (pushKey === lastPushKeyRef.current) return
    lastPushKeyRef.current = pushKey
    setSyncStatus('syncing')
    try {
      if (hasRecordsToPush(extras)) {
        await uploadChangedData(userId, extras)
      }
      for (const id of droppedPlaybookIds) {
        await deletePlaybookCloud(userId, id)
      }
      setSyncStatus('idle')
    } catch (err) {
      lastPushKeyRef.current = ''
      console.warn('本地案例/图表补传到云端失败', err)
      setSyncStatus('error')
      throw err
    }
  }, [])

  const reconcileToDatabase = useCallback(async (options?: {
    firstLoad?: boolean
    signal?: AbortSignal
    localOverride?: CloudCollections
  }) => {
    const userId = userIdRef.current
    if (!userId) return

    const local = options?.localOverride ?? currentCollections()
    const cloud = options?.signal
      ? await withTimeout(fetchAllData(userId, options.signal), CLOUD_SYNC_TIMEOUT_MS, '云端同步超时')
      : await fetchAllData(userId)

    const recovered = !sourceOfTruthReadyRef.current || options?.firstLoad
      ? mergeAndDedupeCloudCollections(local, cloud)
      : overlayUnconfirmedLocal(cloud, local, lastAppliedCloudRef.current ?? cloud, pendingDeletesRef.current)

    recovered.droppedPlaybookIds.forEach((id) => pendingDeletesRef.current.playbook.add(id))
    const extras = recordsToPush(recovered.merged, cloud)
    if (hasRecordsToPush(extras) || recovered.droppedPlaybookIds.length > 0) {
      await pushMissingToCloud(userId, extras, recovered.droppedPlaybookIds)
    }

    const authoritative = options?.signal
      ? await withTimeout(fetchAllData(userId, options.signal), CLOUD_SYNC_TIMEOUT_MS, '云端同步超时')
      : await fetchAllData(userId)

    const stillLocal = currentCollections()
    const lastApplied = lastAppliedCloudRef.current ?? recovered.merged
    const overlaid = overlayUnconfirmedLocal(
      authoritative,
      stillLocal,
      lastApplied,
      pendingDeletesRef.current
    )
    if (overlaid.droppedPlaybookIds.length > 0) {
      overlaid.droppedPlaybookIds.forEach((id) => pendingDeletesRef.current.playbook.add(id))
      await pushMissingToCloud(userId, { trades: [], journal: [], profiles: [], playbook: [] }, overlaid.droppedPlaybookIds)
    }

    applyData(overlaid.merged)
    lastAppliedCloudRef.current = authoritative
    previousCloudIdsRef.current = cloudIdSetsFrom(authoritative)
    sourceOfTruthReadyRef.current = true
    setSyncStatus('idle')
  }, [applyData, currentCollections, pushMissingToCloud])

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
        await reconcileToDatabase({ firstLoad: true, signal: controller.signal, localOverride: local })
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
      setAccountOrder((order) => (order.includes(trimmedId) ? order : [...order, trimmedId]))
    }
    setSelectedAccountState(trimmedId)
  }, [accountProfiles, cloudEnabled, cloudWrite, trades])

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
  }, [cloudEnabled, cloudWrite, trades])

  const deleteAccount = useCallback((id: string) => {
    pendingDeletesRef.current.profiles.add(id)
    setAccountProfiles((prev) => prev.filter((p) => p.id !== id))
    setAccountOrder((prev) => prev.filter((accountId) => accountId !== id))
    setTrades((prev) => {
      prev.filter((t) => t.account === id).forEach((t) => pendingDeletesRef.current.trades.add(t.id))
      return prev.filter((t) => t.account !== id)
    })
    setJournal((prev) => {
      prev.filter((j) => j.account === id).forEach((j) => pendingDeletesRef.current.journal.add(j.id))
      return prev.filter((j) => j.account !== id)
    })
    setPlaybook((prev) => {
      prev.filter((p) => p.account === id).forEach((p) => pendingDeletesRef.current.playbook.add(p.id))
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

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => upsertTrade(userIdRef.current!, trade))
    }
    return trade.id
  }, [cloudEnabled, cloudWrite])

  const updateTrade = useCallback((id: string, updates: Partial<Trade>) => {
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

        if (cloudEnabled && userIdRef.current) {
          cloudWrite(() => upsertTrade(userIdRef.current!, merged))
        }

        return merged
      })
    )
  }, [cloudEnabled, cloudWrite])

  const deleteTrade = useCallback((id: string) => {
    pendingDeletesRef.current.trades.add(id)
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
    pendingDeletesRef.current.journal.add(id)
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
    pendingDeletesRef.current.playbook.delete(entry.id)

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
  }, [cloudEnabled, cloudWrite])

  const deletePlaybookEntry = useCallback((id: string) => {
    pendingDeletesRef.current.playbook.add(id)
    setPlaybook((prev) => prev.filter((p) => p.id !== id))
    setTrades((prev) =>
      prev.map((t) => (t.playbookId === id ? { ...t, playbookId: undefined, updatedAt: new Date().toISOString() } : t))
    )

    if (cloudEnabled && userIdRef.current) {
      cloudWrite(() => deletePlaybookCloud(userIdRef.current!, id))
    }
  }, [cloudEnabled, cloudWrite])

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

    if (cloudEnabled && userIdRef.current && savedEntry) {
      const entry = savedEntry
      cloudWrite(() => upsertPlaybookEntry(userIdRef.current!, entry))
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
