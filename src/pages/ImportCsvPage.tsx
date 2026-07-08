import { useState, useCallback } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { parseCsvFile, downloadCsvTemplate } from '../utils/csvImport'
import type { Trade } from '../types'
import type { CsvFormat } from '../utils/csvImport'
import { PnlBadge } from '../components/PnlBadge'
import { StorageInfo } from '../components/StorageInfo'

export function ImportCsvPage() {
  const { importTrades, setSelectedAccount } = useTradeStore()
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Trade[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; replaced: boolean } | null>(null)
  const [format, setFormat] = useState<CsvFormat | null>(null)
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null)
  /** merge=追加去重（默认）；replace=替换该账户全部记录 */
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrors(['请上传 CSV 格式文件'])
      return
    }
    const result = await parseCsvFile(file)
    setPreview(result.trades)
    setErrors(result.errors)
    setFormat(result.format)
    setDetectedAccount(result.account ?? null)
    setImportResult(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleImport = () => {
    if (preview.length === 0) return
    const result = importTrades(preview, {
      replaceAccount: importMode === 'replace' && detectedAccount ? detectedAccount : undefined,
    })
    if (detectedAccount) {
      setSelectedAccount(detectedAccount)
    }
    setImportResult(result)
    setPreview([])
    setFormat(null)
    setDetectedAccount(null)
  }

  const totalPnl = preview.filter((t) => t.status === 'closed').reduce((s, t) => s + t.pnl, 0)
  const symbols = [...new Set(preview.map((t) => t.symbol))]

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">Import CSV</h1>
        <p className="page-subtitle">
          支持 TradeZella 通用格式，以及 Interactive Brokers (IBKR) 活动账单
        </p>
      </div>

      <StorageInfo className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm" />

      {importResult && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">导入成功</p>
            {importResult.replaced ? (
              <p className="mt-1">已替换该账户全部记录，导入 {importResult.added} 笔交易。</p>
            ) : (
              <p className="mt-1">
                新增 {importResult.added} 笔
                {importResult.skipped > 0 && `，跳过 ${importResult.skipped} 笔重复记录`}
                。历史数据已保留。
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <button
          onClick={downloadCsvTemplate}
          className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 text-left shadow-sm hover:bg-slate-50"
        >
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">下载 CSV 模板</p>
            <p className="text-xs text-slate-500">TradeZella 通用格式模板</p>
          </div>
        </button>

        <div className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">IBKR 活动账单</p>
            <p className="text-xs text-slate-500">自动识别账户，配对期货开/平仓</p>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
        }`}
      >
        <Upload className="mx-auto h-10 w-10 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700">拖拽 CSV 文件到此处</p>
        <p className="mt-1 text-xs text-slate-400">支持 IBKR 活动账单 或 TradeZella 格式</p>
        <label className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          选择文件
          <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
        </label>
      </div>

      {preview.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-800">导入方式</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${importMode === 'merge' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="importMode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} className="mt-1" />
              <div>
                <p className="text-sm font-medium text-slate-900">合并追加（推荐）</p>
                <p className="mt-0.5 text-xs text-slate-500">保留旧记录，只添加新交易，自动跳过重复</p>
              </div>
            </label>
            <label className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${importMode === 'replace' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} className="mt-1" />
              <div>
                <p className="text-sm font-medium text-slate-900">完全替换</p>
                <p className="mt-0.5 text-xs text-slate-500">删除该账户已有记录，用本次 CSV 覆盖</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {format === 'ibkr' && preview.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <p className="font-semibold">已识别为 IBKR 活动账单</p>
          <p className="mt-1 break-words">账户：<strong>{detectedAccount}</strong> · {preview.length} 笔 · {symbols.join(', ')}</p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">解析提示 ({errors.length})</span>
          </div>
          <ul className="mt-2 space-y-1">
            {errors.slice(0, 5).map((err, i) => (
              <li key={i} className="text-xs text-amber-700">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">预览 ({preview.length} 笔)</h3>
              <p className="text-sm text-slate-500">
                总盈亏 <PnlBadge value={totalPnl} className="ml-1" />
              </p>
            </div>
            <button
              onClick={handleImport}
              className="min-h-[44px] rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              确认导入
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-3 font-medium sm:px-4">标的</th>
                    <th className="px-3 py-3 font-medium sm:px-4">方向</th>
                    <th className="px-3 py-3 font-medium sm:px-4">入场</th>
                    <th className="px-3 py-3 font-medium sm:px-4">出场</th>
                    <th className="px-3 py-3 text-right font-medium sm:px-4">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-semibold sm:px-4">{trade.symbol}</td>
                      <td className="px-3 py-2.5 sm:px-4">{trade.side === 'long' ? '做多' : '做空'}</td>
                      <td className="px-3 py-2.5 text-slate-600 sm:px-4">{trade.entryDate.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 text-slate-600 sm:px-4">{trade.exitDate?.slice(0, 10) ?? '-'}</td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        {trade.status === 'closed' ? <PnlBadge value={trade.pnl} /> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 font-semibold text-slate-900">数据存储说明</h3>
        <div className="space-y-3 text-sm text-slate-600">
          <p>数据保存在<strong className="text-slate-800">你当前使用的浏览器</strong>里（localStorage），不会自动同步到云端或其他设备。</p>
          <p>部署到 Vercel / GitHub Pages 等静态网站后，访问方式不变——仍是本地存储。换手机或换浏览器需要重新导入，或自行导出 CSV 备份。</p>
          <p>每月上传新 CSV 时，选择<strong className="text-slate-800">「合并追加」</strong>：旧记录保留，新交易追加，重复交易自动跳过。</p>
          <p>容量：一般浏览器限制约 5–10 MB，可存<strong className="text-slate-800">数万笔</strong>交易，日常使用足够。</p>
        </div>
      </div>
    </div>
  )
}
