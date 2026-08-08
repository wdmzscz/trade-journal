import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Cloud, CheckCircle, AlertCircle, ExternalLink, Clock } from 'lucide-react'
import {
  fetchIbkrSyncSettings,
  saveIbkrSyncSettings,
  triggerIbkrSync,
  type IbkrSyncInterval,
  type IbkrSyncSettings,
} from '../lib/ibkrSyncApi'
import { isCloudEnabled } from '../lib/supabase'
import { useTradeStore } from '../hooks/useTradeStore'
import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/stats'

export function IbkrSyncPage() {
  const { refreshFromCloud, cloudEnabled, setSelectedAccount } = useTradeStore()
  const [settings, setSettings] = useState<IbkrSyncSettings | null>(null)
  const [flexToken, setFlexToken] = useState('')
  const [flexQueryId, setFlexQueryId] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [syncInterval, setSyncInterval] = useState<IbkrSyncInterval>('daily')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!cloudEnabled) {
      setLoading(false)
      return
    }
    fetchIbkrSyncSettings()
      .then((s) => {
        if (s) {
          setSettings(s)
          setFlexToken(s.flex_token)
          setFlexQueryId(s.flex_query_id)
          setAutoSync(s.auto_sync_enabled)
          setSyncInterval(s.auto_sync_interval)
        }
      })
      .catch((e) => setMessage({ type: 'err', text: e instanceof Error ? e.message : '加载失败' }))
      .finally(() => setLoading(false))
  }, [cloudEnabled])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!flexToken.trim() || !flexQueryId.trim()) {
      setMessage({ type: 'err', text: '请填写 Flex Token 和 Query ID' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await saveIbkrSyncSettings({
        flex_token: flexToken,
        flex_query_id: flexQueryId,
        auto_sync_enabled: autoSync,
        auto_sync_interval: syncInterval,
      })
      const updated = await fetchIbkrSyncSettings()
      setSettings(updated)
      setMessage({ type: 'ok', text: '配置已保存' })
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncNow() {
    if (!flexToken.trim() || !flexQueryId.trim()) {
      setMessage({ type: 'err', text: '请填写 Flex Token 和 Query ID' })
      return
    }
    setSyncing(true)
    setMessage(null)
    try {
      await saveIbkrSyncSettings({
        flex_token: flexToken,
        flex_query_id: flexQueryId,
        auto_sync_enabled: autoSync,
        auto_sync_interval: syncInterval,
      })
      const result = await triggerIbkrSync()
      await refreshFromCloud?.()
      if (result.account) {
        setSelectedAccount(result.account)
      }
      const updated = await fetchIbkrSyncSettings()
      setSettings(updated)
      const warnText =
        result.warnings && result.warnings.length > 0 ? ` · ${result.warnings.join('；')}` : ''
      setMessage({
        type: result.added > 0 || (result.tradeCount ?? 0) > 0 ? 'ok' : 'err',
        text: `同步完成：${result.tradeCount ?? 0} 笔交易，交易盈亏合计 ${formatCurrency(result.tradePnl ?? 0)}（已替换旧记录 ${result.skipped} 笔）${warnText}`,
      })
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : '同步失败' })
    } finally {
      setSyncing(false)
    }
  }

  if (!isCloudEnabled()) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="page-title">IBKR 自动同步</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">需要启用 Supabase 云端模式才能使用 IBKR API 同步。</p>
        <Link to="/import" className="text-brand-600 dark:text-brand-400 hover:underline">← 返回 CSV 导入</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">IBKR 自动同步</h1>
        <p className="page-subtitle">
          通过 IBKR Flex Web Service 自动拉取交易数据，无需每次手动下载 CSV
        </p>
      </div>

      <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 p-4 text-sm text-brand-900 dark:text-brand-100">
        <p className="font-semibold">免费说明</p>
        <p className="mt-1">
          IBKR Flex API 对账户持有人<strong>免费</strong>。不是实时推送，但可设置每小时或每天自动同步；
          也可随时点「立即同步」。
        </p>
        <a
          href="https://github.com/wdmzscz/trade-journal/blob/master/IBKR_SYNC.md"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-brand-700 dark:text-brand-300 hover:underline"
        >
          查看完整配置教程 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {settings?.last_sync_at && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {settings.last_sync_status === 'success' ? (
              <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
            )}
            <div className="text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">上次同步</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                {new Date(settings.last_sync_at).toLocaleString('zh-CN')}
                {settings.last_sync_added != null && (
                  <span>
                    {' '}
                    · 写入 {settings.last_sync_added} 笔
                    {settings.last_sync_skipped != null && settings.last_sync_skipped > 0
                      ? ` · 替换旧记录 ${settings.last_sync_skipped} 笔`
                      : ''}
                  </span>
                )}
              </p>
              {settings.last_sync_message && (
                <p
                  className={cn(
                    'mt-1',
                    settings.last_sync_status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {settings.last_sync_message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Flex 凭证</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Flex Token</label>
          <input
            type="password"
            value={flexToken}
            onChange={(e) => setFlexToken(e.target.value)}
            placeholder="在 IBKR Client Portal 生成"
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-surface-700 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            在 IBKR 生成新 Token 后粘贴到此处；点「立即同步」会先保存再请求 IBKR。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Flex Query ID</label>
          <input
            type="text"
            value={flexQueryId}
            onChange={(e) => setFlexQueryId(e.target.value)}
            placeholder="活动账单 Flex Query 的 ID"
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-surface-700 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="border-t border-slate-100 dark:border-surface-800 pt-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">自动同步频率</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            开启后由 GitHub Actions 定时调用（需在仓库 Secrets 配置 CRON_SECRET，见教程）
          </p>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="rounded border-slate-300 dark:border-surface-600"
            />
            启用自动同步
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ['manual', '仅手动', '自己点同步'],
              ['hourly', '每小时', '交易日较及时'],
              ['daily', '每天凌晨 1 点', '等 statement 可用后再同步'],
            ] as const).map(([value, label, desc]) => (
              <label
                key={value}
                className={cn(
                  'cursor-pointer rounded-lg border-2 p-3 text-sm transition-colors',
                  syncInterval === value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40' : 'border-slate-200 dark:border-surface-700',
                  !autoSync && 'opacity-50'
                )}
              >
                <input
                  type="radio"
                  name="interval"
                  value={value}
                  checked={syncInterval === value}
                  disabled={!autoSync}
                  onChange={() => setSyncInterval(value)}
                  className="sr-only"
                />
                <p className="font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
              </label>
            ))}
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              message.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800' : 'bg-red-50 dark:bg-red-950/40 text-red-700'
            )}
          >
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing || !flexToken || !flexQueryId}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-surface-900 px-4 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:bg-brand-950/40 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-surface-700 bg-slate-50 dark:bg-surface-800 p-4 text-xs text-slate-600 dark:text-slate-400 space-y-2">
        <p className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
          <Clock className="h-3.5 w-3.5" /> 关于「实时」
        </p>
        <p>
          IBKR Flex API 是<strong>拉取报表</strong>，不是 WebSocket 推送。最接近实时的方案是<strong>每小时自动同步</strong> + 交易后点「立即同步」。
          真正逐笔实时需要 TWS/IB Gateway，对个人日志来说 Flex 已足够。
        </p>
        <p className="flex items-center gap-1.5">
          <Cloud className="h-3.5 w-3.5" />
          Token 只存在 Supabase 云端，不会出现在前端代码或 GitHub 里。
        </p>
      </div>

      <Link to="/import" className="inline-block text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400">
        ← 仍可使用 CSV 手动导入
      </Link>
    </div>
  )
}
