import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTradeStore } from '../hooks/useTradeStore'
import { calculateTradePnl } from '../utils/stats'
import type { TradeSide, TradeStatus } from '../types'

const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Gap & Go', 'Trend', 'Scalp', 'Other']

export function AddTradePage() {
  const { addTrade, selectedAccount, accounts } = useTradeStore()
  const navigate = useNavigate()

  const defaultAccount = selectedAccount !== 'all' ? selectedAccount : accounts[0] ?? 'Default'

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
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const previewPnl = (() => {
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
    if (!form.entryPrice || isNaN(parseFloat(form.entryPrice))) errs.entryPrice = '请输入有效入场价'
    if (!form.quantity || isNaN(parseFloat(form.quantity))) errs.quantity = '请输入有效数量'
    if (form.status === 'closed' && (!form.exitPrice || isNaN(parseFloat(form.exitPrice)))) {
      errs.exitPrice = '已平仓交易需要出场价'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

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
      account: form.account || 'Default',
      rMultiple: form.rMultiple ? parseFloat(form.rMultiple) : undefined,
    })

    navigate('/trades')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add Trade</h1>
        <p className="mt-1 text-sm text-slate-500">手动添加一笔交易记录</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">基本信息</h2>
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
              <input
                type="text"
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
                className="form-input"
              />
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
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s === 'long' ? '做多 Long' : '做空 Short'}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="状态">
              <div className="flex gap-2">
                {(['closed', 'open'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      form.status === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s === 'closed' ? '已平仓' : '持仓中'}
                  </button>
                ))}
              </div>
            </FormField>
          </div>
        </section>

        <section className="rounded-xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">价格与数量</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="入场日期时间">
              <input type="datetime-local" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="form-input" />
            </FormField>

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
            <div className={`mt-4 rounded-lg p-3 text-center text-sm font-semibold ${previewPnl >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              预计盈亏: {previewPnl >= 0 ? '+' : ''}${previewPnl.toFixed(2)}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">策略与笔记</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="策略 Setup">
              <select value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} className="form-input">
                <option value="">选择策略...</option>
                {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>

            <FormField label="R 倍数">
              <input type="number" step="0.1" value={form.rMultiple} onChange={(e) => setForm({ ...form, rMultiple: e.target.value })} placeholder="2.5" className="form-input" />
            </FormField>

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
          <button type="button" onClick={() => navigate('/trades')} className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

function FormField({ label, error, children, className = '' }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
