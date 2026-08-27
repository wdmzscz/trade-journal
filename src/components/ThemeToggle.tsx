import { Clock, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '../hooks/useTheme'
import { cn } from '../utils/cn'

type ThemeToggleProps = {
  className?: string
  /** Sidebar is already dark — use lighter chrome */
  variant?: 'default' | 'sidebar' | 'header'
}

const LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  time: '跟随时间',
  light: '日间模式',
  dark: '夜间模式',
}

const ICONS = {
  system: Monitor,
  time: Clock,
  light: Sun,
  dark: Moon,
} as const

export function ThemeToggle({ className, variant = 'default' }: ThemeToggleProps) {
  const { preference, resolvedTheme, toggleTheme } = useTheme()

  const autoHint =
    preference === 'system'
      ? `跟随系统外观（当前${resolvedTheme === 'dark' ? '夜间' : '日间'}）`
      : preference === 'time'
        ? `跟随时间（7:00–19:00 日间 · 当前${resolvedTheme === 'dark' ? '夜间' : '日间'}）`
        : LABELS[preference]

  const title = `${autoHint} · 点击切换（系统 → 时间 → 日间 → 夜间）`
  const Icon = ICONS[preference]

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg transition-colors',
        variant === 'sidebar' &&
          'w-full min-h-[36px] justify-center border border-surface-700 px-3 py-2 text-xs text-slate-400 hover:border-surface-600 hover:text-white',
        variant === 'header' &&
          'rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-800',
        variant === 'default' &&
          'border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-surface-700 dark:bg-surface-900 dark:text-slate-200 dark:hover:bg-surface-800',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {variant === 'sidebar' && <span>{LABELS[preference]}</span>}
    </button>
  )
}
