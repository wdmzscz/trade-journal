import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { PnlBadge } from '../components/PnlBadge'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import { computeDailyPnl } from '../utils/stats'

const EMPTY_FORM = {
  mood: '',
  marketCondition: '',
  preMarketPlan: '',
  postMarketReview: '',
  lessons: '',
  goals: '',
  rating: 3,
}

export function DailyJournalPage() {
  const { filteredTrades, filteredJournal, selectedAccount, saveJournal, getJournalByDate } = useTradeStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm] = useState(EMPTY_FORM)

  const dailyPnl = useMemo(() => computeDailyPnl(filteredTrades), [filteredTrades])
  const pnlMap = useMemo(() => new Map(dailyPnl.map((d) => [d.date, d])), [dailyPnl])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const selectedEntry = getJournalByDate(selectedDate)
  const selectedPnl = pnlMap.get(selectedDate)
  const dayTrades = filteredTrades.filter(
    (t) => t.entryDate.slice(0, 10) === selectedDate || t.exitDate?.slice(0, 10) === selectedDate
  )

  const journalDates = useMemo(() => new Set(filteredJournal.map((j) => j.date)), [filteredJournal])
  const canEditJournal = selectedAccount !== 'all'

  // 切换账户时重置表单和选中日期
  useEffect(() => {
    const entry = getJournalByDate(selectedDate)
    setForm({
      mood: entry?.mood ?? '',
      marketCondition: entry?.marketCondition ?? '',
      preMarketPlan: entry?.preMarketPlan ?? '',
      postMarketReview: entry?.postMarketReview ?? '',
      lessons: entry?.lessons ?? '',
      goals: entry?.goals ?? '',
      rating: entry?.rating ?? 3,
    })
  }, [selectedAccount, selectedDate, getJournalByDate])

  const loadFormForDate = (date: string) => {
    setSelectedDate(date)
    const entry = getJournalByDate(date)
    setForm({
      mood: entry?.mood ?? '',
      marketCondition: entry?.marketCondition ?? '',
      preMarketPlan: entry?.preMarketPlan ?? '',
      postMarketReview: entry?.postMarketReview ?? '',
      lessons: entry?.lessons ?? '',
      goals: entry?.goals ?? '',
      rating: entry?.rating ?? 3,
    })
  }

  const handleSave = () => {
    if (!canEditJournal) return
    saveJournal({ ...form, date: selectedDate, account: selectedAccount, id: selectedEntry?.id })
    alert('日记已保存')
  }

  return (
    <div className="space-y-6">
      <AccountScopeBanner />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Daily Journal</h1>
        <p className="mt-1 text-sm text-slate-500">记录每日交易计划、复盘与心得（按账户独立保存）</p>
      </div>

      {!canEditJournal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          请先选择具体账户标签页，再编辑该账户的日记。汇总视图下日记为只读。
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))} className="rounded p-1 hover:bg-slate-100">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="font-semibold">{format(currentMonth, 'yyyy年 M月', { locale: zhCN })}</h3>
            <button onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))} className="rounded p-1 hover:bg-slate-100">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: days[0].getDay() }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const pnl = pnlMap.get(dateStr)
              const hasJournal = journalDates.has(dateStr)
              const isSelected = dateStr === selectedDate

              return (
                <button
                  key={dateStr}
                  onClick={() => loadFormForDate(dateStr)}
                  className={`relative flex flex-col items-center rounded-lg p-1.5 text-xs transition-colors ${
                    isSelected ? 'bg-brand-600 text-white' : isToday(day) ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'
                  } ${!isSameMonth(day, currentMonth) ? 'opacity-40' : ''}`}
                >
                  <span className="font-medium">{format(day, 'd')}</span>
                  {pnl && (
                    <span className={`text-[10px] ${isSelected ? 'text-white' : pnl.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {pnl.pnl >= 0 ? '+' : ''}{pnl.pnl.toFixed(0)}
                    </span>
                  )}
                  {hasJournal && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-400" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <div>
              <h3 className="font-semibold text-slate-900">
                {format(parseISO(selectedDate), 'yyyy年 M月 d日 EEEE', { locale: zhCN })}
              </h3>
              <p className="text-sm text-slate-500">{dayTrades.length} 笔交易</p>
            </div>
            {selectedPnl && <PnlBadge value={selectedPnl.pnl} />}
          </div>

          {dayTrades.length > 0 && (
            <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
              <h4 className="mb-2 text-sm font-semibold text-slate-700">当日交易</h4>
              <div className="space-y-2">
                {dayTrades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.symbol} · {t.side === 'long' ? '做多' : '做空'}</span>
                    {t.status === 'closed' && <PnlBadge value={t.pnl} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`rounded-xl border border-surface-200 bg-white p-5 shadow-sm ${!canEditJournal ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="心情" value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} placeholder="平静 / 焦虑 / 自信..." disabled={!canEditJournal} />
              <Field label="市场状况" value={form.marketCondition} onChange={(v) => setForm({ ...form, marketCondition: v })} placeholder="趋势 / 震荡 / 高波动..." disabled={!canEditJournal} />
            </div>

            <div className="mt-4 space-y-4">
              <TextArea label="盘前计划" value={form.preMarketPlan} onChange={(v) => setForm({ ...form, preMarketPlan: v })} placeholder="今日交易计划、关注标的、关键价位..." disabled={!canEditJournal} />
              <TextArea label="盘后复盘" value={form.postMarketReview} onChange={(v) => setForm({ ...form, postMarketReview: v })} placeholder="执行情况、做得好的地方、需要改进..." disabled={!canEditJournal} />
              <TextArea label="经验教训" value={form.lessons} onChange={(v) => setForm({ ...form, lessons: v })} placeholder="今天学到了什么？" disabled={!canEditJournal} />
              <TextArea label="明日目标" value={form.goals} onChange={(v) => setForm({ ...form, goals: v })} placeholder="明天的改进目标..." disabled={!canEditJournal} />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">今日评分</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    disabled={!canEditJournal}
                    onClick={() => setForm({ ...form, rating: n })}
                    className={`h-10 w-10 rounded-lg text-sm font-semibold transition-colors ${
                      form.rating === n ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } disabled:cursor-not-allowed`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!canEditJournal}
              className="mt-6 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              保存日记
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
      />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
      />
    </div>
  )
}
