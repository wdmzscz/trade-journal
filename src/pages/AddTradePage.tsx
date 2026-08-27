import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { calculateTradePnl, formatCurrency } from '../utils/stats'
import type { TradeSide, TradeStatus } from '../types'
import { cn } from '../utils/cn'

const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Gap & Go', 'Trend', 'Scalp', 'Other']

export function AddTradePage() {
  const { addTrade, updateAccount, selectedAccount, accounts, accountProfiles, accountInfos } =
    useTradeStore()
  const navigate = useNavigate()

  const defaultAccount = selectedAccount !== 'all' ? selectedAccount : accounts[0] ?? 'Default'
  const isPaperAccount = useMemo(() => {
    return Boolean(accountProfiles.find((p) => p.id === defaultAccount)?.isPaper)
  }, [accountProfiles, defaultAccount])

  const paperProfile = accountProfiles.find((p) => p.id === defaultAccount)
  const paperBalanceDefault =
    paperProfile?.startingCapital ??
    paperProfile?.totalDeposits ??
    paperProfile?.currentCapital ??
    ''

  const [form, setForm] = useState({
    symbol: '',
    side: 'long' as TradeSide,
    status: 'closed' as TradeStatus,
    entryDate: new Date().toISOString().slice(0, 16),
    exitDate: new Date().toISOString().slice(0, 16),
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    fees: '0',
    setup: '',
    tags: '',
    notes: '',
    account: defaultAccount,
    rMultiple: '',
    maxRr: '',
    stopLoss: '',
    pnl: '',
    accountBalance: paperBalanceDefault !== '' ? String(paperBalanceDefault) : '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const selectedIsPaper = useMemo(() => {
    return Boolean(accountProfiles.find((p) => p.id === form.account)?.isPaper)
  }, [accountProfiles, form.account])

  const previewPnl = (() => {
    if (selectedIsPaper) {
      if (!form.pnl || isNaN(parseFloat(form.pnl))) return null
      return parseFloat(form.pnl)
    }
    if (form.status !== 'closed' || !form.exitPrice || !form.entryPrice || !form.quantity) return null
    return calculateTradePnl(
      form.side,
      parseFloat(form.entryPrice),
      parseFloat(form.exitPrice),
      parseFloat(form.quantity),
      parseFloat(form.fees) || 0
    )
  })()

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.symbol.trim()) errs.symbol = '请输入标的代码'

    if (selectedIsPaper) {
      if (form.pnl === '' || isNaN(parseFloat(form.pnl))) errs.pnl = '请填写盈亏金额 ($)'
      if (form.rMultiple === '' || isNaN(parseFloat(form.rMultiple))) errs.rMultiple = '请填写盈亏 R'
    } else {
      if (!form.entryPrice || isNaN(parseFloat(form.entryPrice))) errs.entryPrice = '请输入有效入场价'
      if (!form.quantity || isNaN(parseFloat(form.quantity))) errs.quantity = '请输入有效数量'
      if (form.status === 'closed' && (!form.exitPrice || isNaN(parseFloat(form.exitPrice)))) {
        errs.exitPrice = '已平仓交易需要出场价'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const account = form.account || 'Default'

    if (selectedIsPaper) {
      const pnl = parseFloat(form.pnl)
      const rMultiple = parseFloat(form.rMultiple)
      const maxRr = form.maxRr.trim() ? parseFloat(form.maxRr) : undefined
      const stopLoss = form.stopLoss.trim() ? parseFloat(form.stopLoss) : undefined
      const balance = form.accountBalance.trim() ? parseFloat(form.accountBalance) : undefined
      const entryIso = new Date(form.entryDate).toISOString()

      addTrade({
        symbol: form.symbol.toUpperCase().trim(),
        side: form.side,
        status: 'closed',
        entryDate: entryIso,
        exitDate: entryIso,
        entryPrice: 0,
        exitPrice: 0,
        quantity: 1,
        fees: 0,
        pnl,
        rMultiple,
        maxRr: maxRr != null && !Number.isNaN(maxRr) ? maxRr : undefined,
        stopLoss: stopLoss != null && !Number.isNaN(stopLoss) ? stopLoss : undefined,
        setup: form.setup || undefined,
        tags: form.tags ? form.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
        notes: form.notes || undefined,
        account,
      })

      if (balance != null && !Number.isNaN(balance) && balance > 0) {
        const accountTradesPnl = accountInfos.find((a) => a.id === account)?.totalPnl ?? 0
        updateAccount(account, {
          isPaper: true,
          startingCapital: balance,
          totalDeposits: balance,
          currentCapital: balance + accountTradesPnl + pnl,
        })
      }

      navigate('/trades')
      return
    }

    addTrade({
      symbol: form.symbol.toUpperCase().trim(),
      side: form.side,
      status: form.status,
      entryDate: new Date(form.entryDate).toISOString(),
      exitDate: form.status === 'closed' ? new Date(form.exitDate).toISOString() : undefined,
      entryPrice: parseFloat(form.entryPrice),
      exitPrice: form.status === 'closed' ? parseFloat(form.exitPrice) : undefined,
      quantity: parseFloat(form.quantity),
      fees: parseFloat(form.fees) || 0,
      setup: form.setup || undefined,
      tags: form.tags ? form.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
      notes: form.notes || undefined,
      account,
      rMultiple: form.rMultiple ? parseFloat(form.rMultiple) : undefined,
    })

    navigate('/trades')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {selectedIsPaper ? 'Add Paper Trade' : 'Add Trade'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {selectedIsPaper
            ? 'Paper 账户简化记账：填写盈亏 $、R、Max R、Stop Loss，自动进入统计 / 图表 / 日历'
            : '手动添加一笔交易记录'}
        </p>
      </div>

      {selectedIsPaper && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <p className="text-sm text-violet-900 dark:text-violet-100">
            当前账户为 <span className="font-semibold">Paper Account</span>
            {isPaperAccount ? '' : '（已切换）'}。无需填写入场/出场价，只需记录盈亏金额即可。
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">基本信息</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="标的 Symbol *" error={errors.symbol}>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="AAPL"
                className="form-input"
              />
            </FormField>

            <FormField label="账户">
              <select
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
                className="form-input"
              >
                {accounts.map((id) => {
                  const info = accountInfos.find((a) => a.id === id)
                  return (
                    <option key={id} value={id}>
                      {info?.label ?? id}{info?.isPaper ? ' (Paper)' : ''}
                    </option>
                  )
                })}
              </select>
            </FormField>

            <FormField label="方向">
              <div className="flex gap-2">
                {(['long', 'short'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, side: s })}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      form.side === s
                        ? s === 'long' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                        : 'bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {s === 'long' ? '做多 Long' : '做空 Short'}
                  </button>
                ))}
              </div>
            </FormField>

            {!selectedIsPaper && (
              <FormField label="状态">
                <div className="flex gap-2">
                  {(['closed', 'open'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, status: s })}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                        form.status === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {s === 'closed' ? '已平仓' : '持仓中'}
                    </button>
                  ))}
                </div>
              </FormField>
            )}

            <FormField label="交易日期时间">
              <input
                type="datetime-local"
                value={form.entryDate}
                onChange={(e) => setForm({ ...form, entryDate: e.target.value, exitDate: e.target.value })}
                className="form-input"
              />
            </FormField>
          </div>
        </section>

        {selectedIsPaper ? (
          <section className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-white dark:bg-surface-900 p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-violet-800 dark:text-violet-200">Paper 交易结果</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="盈亏金额 $ *" error={errors.pnl}>
                <input
                  type="number"
                  step="0.01"
                  value={form.pnl}
                  onChange={(e) => setForm({ ...form, pnl: e.target.value })}
                  placeholder="例如 250 或 -120"
                  className="form-input"
                />
              </FormField>
              <FormField label="盈亏 R *" error={errors.rMultiple}>
                <input
                  type="number"
                  step="0.01"
                  value={form.rMultiple}
                  onChange={(e) => setForm({ ...form, rMultiple: e.target.value })}
                  placeholder="例如 2.0 或 -1"
                  className="form-input"
                />
              </FormField>
              <FormField label="最高收益 Max R">
                <input
                  type="number"
                  step="0.01"
                  value={form.maxRr}
                  onChange={(e) => setForm({ ...form, maxRr: e.target.value })}
                  placeholder="例如 2.8"
                  className="form-input"
                />
              </FormField>
              <FormField label="Stop Loss ($)">
                <input
                  type="number"
                  step="0.01"
                  value={form.stopLoss}
                  onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                  placeholder="例如 500"
                  className="form-input"
                />
              </FormField>
              <FormField label="账户总金额设定" hint="写入该 Paper 账户本金" className="sm:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  value={form.accountBalance}
                  onChange={(e) => setForm({ ...form, accountBalance: e.target.value })}
                  placeholder="50000"
                  className="form-input"
                />
              </FormField>
            </div>

            {previewPnl !== null && (
              <div
                className={cn(
                  'mt-4 rounded-lg p-3 text-center text-sm font-semibold',
                  previewPnl >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                )}
              >
                记录盈亏: {formatCurrency(previewPnl)}
                {form.rMultiple && !isNaN(parseFloat(form.rMultiple))
                  ? ` · ${parseFloat(form.rMultiple) >= 0 ? '+' : ''}${parseFloat(form.rMultiple).toFixed(2)}R`
                  : ''}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">价格与数量</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {form.status === 'closed' && (
                <FormField label="出场日期时间">
                  <input type="datetime-local" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} className="form-input" />
                </FormField>
              )}

              <FormField label="入场价 *" error={errors.entryPrice}>
                <input type="number" step="0.01" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} placeholder="0.00" className="form-input" />
              </FormField>

              {form.status === 'closed' && (
                <FormField label="出场价 *" error={errors.exitPrice}>
                  <input type="number" step="0.01" value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} placeholder="0.00" className="form-input" />
                </FormField>
              )}

              <FormField label="数量 *" error={errors.quantity}>
                <input type="number" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="100" className="form-input" />
              </FormField>

              <FormField label="手续费">
                <input type="number" step="0.01" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} className="form-input" />
              </FormField>
            </div>

            {previewPnl !== null && (
              <div className={`mt-4 rounded-lg p-3 text-center text-sm font-semibold ${previewPnl >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
                预计盈亏: {previewPnl >= 0 ? '+' : ''}${previewPnl.toFixed(2)}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">策略与笔记</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="策略 Setup">
              <select value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} className="form-input">
                <option value="">选择策略...</option>
                {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>

            {!selectedIsPaper && (
              <FormField label="R 倍数">
                <input type="number" step="0.1" value={form.rMultiple} onChange={(e) => setForm({ ...form, rMultiple: e.target.value })} placeholder="2.5" className="form-input" />
              </FormField>
            )}

            <FormField label="标签 (逗号分隔)" className="sm:col-span-2">
              <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="momentum, earnings" className="form-input" />
            </FormField>

            <FormField label="交易笔记" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                placeholder="入场理由、执行情况、改进点..."
                className="form-input"
              />
            </FormField>
          </div>
        </section>

        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700">
            保存交易
          </button>
          <button type="button" onClick={() => navigate('/trades')} className="rounded-lg border border-slate-200 dark:border-surface-700 px-6 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-800 dark:bg-surface-800">
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

function FormField({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}
