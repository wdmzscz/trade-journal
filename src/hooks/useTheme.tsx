import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** @deprecated use ThemePreference */
export type ThemeMode = ThemePreference

const STORAGE_KEY = 'trade-journal-theme-v2'

/** 本地时间：7:00–18:59 日间，其余夜间 */
export const THEME_DAY_START_HOUR = 7
export const THEME_NIGHT_START_HOUR = 19

type ThemeContextValue = {
  /** User preference: follow clock, or force light/dark */
  preference: ThemePreference
  /** Actual applied theme after resolving time / override */
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  /** Cycle: system → light → dark → system */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

export function resolveTheme(preference: ThemePreference, now = new Date()): ResolvedTheme {
  return preference === 'system' ? getTimeBasedTheme(now) : preference
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
  const [clockTheme, setClockTheme] = useState<ResolvedTheme>(() => getTimeBasedTheme())

  const resolvedTheme = preference === 'system' ? clockTheme : preference

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
      if (prev === 'system') return 'light'
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
