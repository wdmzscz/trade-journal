import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { BacktestSettings, BacktestTrade } from '../types/backtest'
import { DEFAULT_BACKTEST_SETTINGS, emptyBacktestTrade } from '../types/backtest'
import { isCloudEnabled } from '../lib/supabase'
import { fetchBacktestWorkspace, upsertBacktestWorkspace } from '../lib/backtestSync'
import { useAuth } from './useAuth'

const SETTINGS_KEY = 'trade-journal-backtest-settings'
const TRADES_KEY = 'trade-journal-backtest-trades'

function loadLocalSettings(): BacktestSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BACKTEST_SETTINGS }
    return { ...DEFAULT_BACKTEST_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_BACKTEST_SETTINGS }
  }
}

function loadLocalTrades(): BacktestTrade[] {
  try {
    const raw = localStorage.getItem(TRADES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

type BacktestContextValue = {
  settings: BacktestSettings
  trades: BacktestTrade[]
  ready: boolean
  updateSettings: (patch: Partial<BacktestSettings>) => void
  addTrade: () => string
  updateTrade: (id: string, patch: Partial<BacktestTrade>) => void
  deleteTrade: (id: string) => void
  duplicateTrade: (id: string) => void
}

const BacktestContext = createContext<BacktestContextValue | null>(null)

export function BacktestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const cloud = isCloudEnabled()
  const [settings, setSettings] = useState<BacktestSettings>(loadLocalSettings)
  const [trades, setTrades] = useState<BacktestTrade[]>(loadLocalTrades)
  const [ready, setReady] = useState(!cloud)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydrated = useRef(false)

  useEffect(() => {
    if (!cloud || !user?.id) {
      setReady(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const remote = await fetchBacktestWorkspace(user.id)
        if (cancelled) return
        if (remote) {
          setSettings(remote.settings)
          setTrades(remote.trades)
        } else {
          const localSettings = loadLocalSettings()
          const localTrades = loadLocalTrades()
          if (localTrades.length > 0 || JSON.stringify(localSettings) !== JSON.stringify(DEFAULT_BACKTEST_SETTINGS)) {
            await upsertBacktestWorkspace(user.id, localSettings, localTrades)
            setSettings(localSettings)
            setTrades(localTrades)
          }
        }
      } catch (e) {
        console.error('backtest load failed', e)
      } finally {
        if (!cancelled) {
          hydrated.current = true
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud, user?.id])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
    } catch {
      /* ignore */
    }

    if (!cloud || !user?.id || !hydrated.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      upsertBacktestWorkspace(user.id, settings, trades).catch((e) =>
        console.error('backtest save failed', e)
      )
    }, 600)
  }, [settings, trades, ready, cloud, user?.id])

  const updateSettings = useCallback((patch: Partial<BacktestSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const addTrade = useCallback(() => {
    const now = new Date().toISOString()
    const id = uuidv4()
    const trade: BacktestTrade = {
      ...emptyBacktestTrade(),
      id,
      createdAt: now,
      updatedAt: now,
    }
    setTrades((prev) => [...prev, trade])
    return id
  }, [])

  const updateTrade = useCallback((id: string, patch: Partial<BacktestTrade>) => {
    const now = new Date().toISOString()
    setTrades((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t))
    )
  }, [])

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const duplicateTrade = useCallback((id: string) => {
    setTrades((prev) => {
      const src = prev.find((t) => t.id === id)
      if (!src) return prev
      const now = new Date().toISOString()
      const copy: BacktestTrade = {
        ...src,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }
      const idx = prev.findIndex((t) => t.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      settings,
      trades,
      ready,
      updateSettings,
      addTrade,
      updateTrade,
      deleteTrade,
      duplicateTrade,
    }),
    [settings, trades, ready, updateSettings, addTrade, updateTrade, deleteTrade, duplicateTrade]
  )

  return <BacktestContext.Provider value={value}>{children}</BacktestContext.Provider>
}

export function useBacktestStore() {
  const ctx = useContext(BacktestContext)
  if (!ctx) throw new Error('useBacktestStore must be used within BacktestProvider')
  return ctx
}
