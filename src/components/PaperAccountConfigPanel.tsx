import { useEffect, useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { resolvePaperSettings, type PaperAccountSettings } from '../types'
import { formatCurrency, formatPercent } from '../utils/stats'
import { cn } from '../utils/cn'

function parseNum(raw: string, fallback: number): number {
  const n = Number(raw.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : fallback
}

function formatInputMoney(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(n)
}

export function PaperAccountConfigPanel({ className }: { className?: string }) {
  const {
    selectedAccount,
    selectedAccountInfo,
    accountProfiles,
    updateAccount,
  } = useTradeStore()

  const profile = useMemo(() => {
    if (selectedAccount === 'all') return null
    return accountProfiles.find((p) => p.id === selectedAccount) ?? null
  }, [selectedAccount, accountProfiles])

  const isPaper = Boolean(profile?.isPaper || selectedAccountInfo?.isPaper)
  const settings = resolvePaperSettings(profile?.paperSettings)
  const balance = selectedAccountInfo?.principalCapital ?? 0
  const totalPnl = selectedAccountInfo?.totalPnl ?? 0
  const equity = selectedAccountInfo?.currentCapital ?? 0
  const roi = balance > 0 ? (totalPnl / balance) * 100 : 0
  const riskDollars = balance * (settings.riskPercent / 100)

  const [balanceStr, setBalanceStr] = useState(() => formatInputMoney(balance || 50000))
  const [riskStr, setRiskStr] = useState(() => String(settings.riskPercent))
  const [beMinStr, setBeMinStr] = useState(() => String(settings.beMinR))
  const [beMaxStr, setBeMaxStr] = useState(() => String(settings.beMaxR))
  const [costStr, setCostStr] = useState(() => String(settings.costPerTradeR))

  useEffect(() => {
    if (!profile?.isPaper) return
    const next = resolvePaperSettings(profile.paperSettings)
    const nextBalance = selectedAccountInfo?.principalCapital ?? 0
    setBalanceStr(formatInputMoney(nextBalance > 0 ? nextBalance : 50000))
    setRiskStr(String(next.riskPercent))
    setBeMinStr(String(next.beMinR))
    setBeMaxStr(String(next.beMaxR))
    setCostStr(String(next.costPerTradeR))
  }, [profile?.id, profile?.isPaper, profile?.paperSettings, selectedAccountInfo?.principalCapital])

  if (!isPaper || !profile || selectedAccount === 'all') return null

  const commitBalance = (raw: string) => {
    const value = parseNum(raw, balance > 0 ? balance : 50000)
    setBalanceStr(formatInputMoney(value))
    updateAccount(profile.id, {
      isPaper: true,
      startingCapital: value,
      totalDeposits: value,
      currentCapital: value + totalPnl,
    })
  }

  const commitSettings = (patch: Partial<PaperAccountSettings>, local?: {
    risk?: string
    beMin?: string
    beMax?: string
    cost?: string
  }) => {
    if (local?.risk != null) setRiskStr(local.risk)
    if (local?.beMin != null) setBeMinStr(local.beMin)
    if (local?.beMax != null) setBeMaxStr(local.beMax)
    if (local?.cost != null) setCostStr(local.cost)

    updateAccount(profile.id, {
      isPaper: true,
      paperSettings: {
        ...settings,
        ...patch,
      },
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-violet-200 bg-violet-50/80 shadow-sm dark:border-violet-800 dark:bg-violet-950/30',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/80 px-4 py-2.5 dark:border-violet-800/80">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-100">
          <FlaskConical className="h-4 w-4" />
          模拟账户参数
          <span className="font-normal text-violet-700/80 dark:text-violet-300/80">
            · 可随时修改，立即影响日历 / 收益曲线本金
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-violet-800 dark:text-violet-200">
          <span>
            风险金额 <strong>{formatCurrency(riskDollars)}</strong>
          </span>
          <span>
            当前权益 <strong>{formatCurrency(equity)}</strong>
          </span>
          <span className={roi >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            收益率 <strong>{formatPercent(roi)}</strong>
          </span>
        </div>
      </div>

      <div className="divide-y divide-violet-100 dark:divide-violet-900/50">
        <ConfigRow note="模拟账户起始本金。改完后日历与曲线按新本金重算。">
          <span>账户总金额</span>
          <YellowInput
            value={balanceStr}
            onChange={setBalanceStr}
            onCommit={() => commitBalance(balanceStr)}
            prefix="$"
            width="w-28"
          />
          <span>，每笔风险</span>
          <YellowInput
            value={riskStr}
            onChange={setRiskStr}
            onCommit={() => {
              const riskPercent = parseNum(riskStr, settings.riskPercent)
              setRiskStr(String(riskPercent))
              commitSettings({ riskPercent })
            }}
            suffix="%"
            width="w-16"
          />
        </ConfigRow>

        <ConfigRow note="盈亏平衡（BE）的 R 区间。落在此区间内计为持平。">
          <span>我将盈亏平衡视为介于</span>
          <YellowInput
            value={beMinStr}
            onChange={setBeMinStr}
            onCommit={() => {
              const beMinR = parseNum(beMinStr, settings.beMinR)
              setBeMinStr(String(beMinR))
              commitSettings({ beMinR })
            }}
            width="w-16"
          />
          <span>到</span>
          <YellowInput
            value={beMaxStr}
            onChange={setBeMaxStr}
            onCommit={() => {
              const beMaxR = parseNum(beMaxStr, settings.beMaxR)
              setBeMaxStr(String(beMaxR))
              commitSettings({ beMaxR })
            }}
            width="w-16"
          />
          <span>（单位：R）</span>
        </ConfigRow>

        <ConfigRow note="每笔交易成本（点差/滑点/佣金），以 R 计；不确定可留 0。">
          <span>每笔交易大约支付</span>
          <YellowInput
            value={costStr}
            onChange={setCostStr}
            onCommit={() => {
              const costPerTradeR = parseNum(costStr, settings.costPerTradeR)
              setCostStr(String(costPerTradeR))
              commitSettings({ costPerTradeR })
            }}
            suffix="R"
            width="w-16"
          />
          <span>的成本</span>
        </ConfigRow>
      </div>
    </div>
  )
}

function ConfigRow({
  children,
  note,
}: {
  children: React.ReactNode
  note: string
}) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_minmax(140px,220px)] sm:items-center">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-800 dark:text-slate-200">
        {children}
      </div>
      <p className="text-xs leading-relaxed text-violet-700/80 dark:text-violet-300/70">{note}</p>
    </div>
  )
}

function YellowInput({
  value,
  onChange,
  onCommit,
  prefix,
  suffix,
  width = 'w-20',
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  prefix?: string
  suffix?: string
  width?: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {prefix && <span className="text-slate-500 dark:text-slate-400">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
        className={cn(
          'rounded border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-center text-sm font-semibold text-slate-900 shadow-sm outline-none',
          'focus:border-amber-500 focus:ring-2 focus:ring-amber-200',
          'dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50 dark:focus:ring-amber-900',
          width
        )}
      />
      {suffix && <span className="text-slate-500 dark:text-slate-400">{suffix}</span>}
    </span>
  )
}
