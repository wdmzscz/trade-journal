import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** system = OS 外观 · time = 本地时钟 · light/dark = 强制 */
export type ThemePreference = 'system' | 'time' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** @deprecated use ThemePreference */
export type ThemeMode = ThemePreference

const STORAGE_KEY = 'trade-journal-theme-v3'
const LEGACY_STORAGE_KEY = 'trade-journal-theme-v2'

/** 本地时间：7:00–18:59 日间，其余夜间 */
export const THEME_DAY_START_HOUR = 7
export const THEME_NIGHT_START_HOUR = 19

type ThemeContextValue = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  /** Cycle: system → time → light → dark → system */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getTimeBasedTheme(now = new Date()): ResolvedTheme {
  const hour = now.getHours()
  return hour >= THEME_DAY_START_HOUR && hour < THEME_NIGHT_START_HOUR ? 'light' : 'dark'
}

/** 距离下一次日间/夜间切换的毫秒数 */
export function msUntilNextThemeBoundary(now = new Date()): number {
  const next = new Date(now)
  next.setSeconds(0, 0)
  next.setMilliseconds(0)
  next.setMinutes(0)

  const hour = now.getHours()
  if (hour < THEME_DAY_START_HOUR) {
    next.setHours(THEME_DAY_START_HOUR)
  } else if (hour < THEME_NIGHT_START_HOUR) {
    next.setHours(THEME_NIGHT_START_HOUR)
  } else {
    next.setDate(next.getDate() + 1)
    next.setHours(THEME_DAY_START_HOUR)
  }

  return Math.max(1000, next.getTime() - now.getTime())
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw === 'dark' || raw === 'light' || raw === 'system' || raw === 'time') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  opts?: { systemTheme?: ResolvedTheme; now?: Date }
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  if (preference === 'time') return getTimeBasedTheme(opts?.now)
  return opts?.systemTheme ?? getSystemTheme()
}

export function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#7c3aed')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system'
    return readStoredPreference()
  })
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const [clockTheme, setClockTheme] = useState<ResolvedTheme>(() => getTimeBasedTheme())

  const resolvedTheme = useMemo(() => {
    if (preference === 'light' || preference === 'dark') return preference
    if (preference === 'time') return clockTheme
    return systemTheme
  }, [preference, clockTheme, systemTheme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light')
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = () => {
      setClockTheme(getTimeBasedTheme())
      if (timer) clearTimeout(timer)
      timer = setTimeout(sync, msUntilNextThemeBoundary())
    }

    sync()

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    applyThemeClass(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* ignore */
    }
  }, [preference])

  const setTheme = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => {
      if (prev === 'system') return 'time'
      if (prev === 'time') return 'light'
      if (prev === 'light') return 'dark'
      return 'system'
    })
  }, [])

  const value = useMemo(
    () => ({ preference, resolvedTheme, setTheme, toggleTheme }),
    [preference, resolvedTheme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
