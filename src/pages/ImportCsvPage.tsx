import { useState, useCallback } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { parseCsvFile, downloadCsvTemplate } from '../utils/csvImport'
import type { Trade } from '../types'
import type { CsvFormat } from '../utils/csvImport'
import { PnlBadge } from '../components/PnlBadge'
import { formatCurrency } from '../utils/stats'

export function ImportCsvPage() {
  const { importTrades, setSelectedAccount } = useTradeStore()
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Trade[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState(false)
  const [format, setFormat] = useState<CsvFormat | null>(null)
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null)
  const [replaceExisting, setReplaceExisting] = useState(true)

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
    setImported(false)
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
    importTrades(preview, {
      replaceAccount: replaceExisting && detectedAccount ? detectedAccount : undefined,
    })
    if (detectedAccount) {
      setSelectedAccount(detectedAccount)
    }
    setImported(true)
    setPreview([])
    setFormat(null)
    setDetectedAccount(null)
  }

  const totalPnl = preview.filter((t) => t.status === 'closed').reduce((s, t) => s + t.pnl, 0)
  const symbols = [...new Set(preview.map((t) => t.symbol))]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import CSV</h1>
        <p className="mt-1 text-sm text-slate-500">
          支持 TradeZella 通用格式，以及 Interactive Brokers (IBKR) 活动账单
        </p>
      </div>

      {imported && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">导入成功！交易已添加到 Trades 列表，Dashboard 和 Calendar 已更新。</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="text-xs text-slate-500">自动识别账户号，配对期货开/平仓，使用已实现损益</p>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
        }`}
      >
        <Upload className="mx-auto h-10 w-10 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700">拖拽 CSV 文件到此处</p>
        <p className="mt-1 text-xs text-slate-400">支持 IBKR 活动账单 或 TradeZella 格式</p>
        <label className="mt-3 inline-block cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          选择文件
          <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
        </label>
      </div>

      {format === 'ibkr' && preview.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <p className="font-semibold">已识别为 IBKR 活动账单</p>
          <p className="mt-1">账户：<strong>{detectedAccount}</strong> · {preview.length} 笔已配对交易 · 标的：{symbols.join(', ')}</p>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded border-brand-300"
            />
            <span>替换该账户的已有交易记录（推荐，避免重复导入）</span>
          </label>
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
            {errors.length > 5 && <li className="text-xs text-amber-600">...还有 {errors.length - 5} 条</li>}
          </ul>
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">预览 ({preview.length} 笔交易)</h3>
              <p className="text-sm text-slate-500">
                总盈亏 <PnlBadge value={totalPnl} className="ml-1" />
                {format === 'ibkr' && (
                  <span className="ml-2 text-slate-400">（与 IBKR 已实现损益一致：{formatCurrency(totalPnl)}）</span>
                )}
              </p>
            </div>
            <button
              onClick={handleImport}
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              确认导入
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-3 font-medium">标的</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">方向</th>
                    <th className="px-4 py-3 font-medium">入场</th>
                    <th className="px-4 py-3 font-medium">出场</th>
                    <th className="px-4 py-3 font-medium">入场价</th>
                    <th className="px-4 py-3 font-medium">出场价</th>
                    <th className="px-4 py-3 font-medium">数量</th>
                    <th className="px-4 py-3 font-medium">账户</th>
                    <th className="px-4 py-3 text-right font-medium">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold">{trade.symbol}</td>
                      <td className="px-4 py-2.5">{trade.setup ?? '-'}</td>
                      <td className="px-4 py-2.5">{trade.side === 'long' ? '做多' : '做空'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{trade.entryDate.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{trade.exitDate?.slice(0, 10) ?? '-'}</td>
                      <td className="px-4 py-2.5">${trade.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}</td>
                      <td className="px-4 py-2.5">{trade.quantity}</td>
                      <td className="px-4 py-2.5 text-slate-600">{trade.account}</td>
                      <td className="px-4 py-2.5 text-right">
                        {trade.status === 'closed' ? <PnlBadge value={trade.pnl} /> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 20 && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                仅显示前 20 条，共 {preview.length} 条
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-900">格式说明</h3>
        <div className="space-y-3 text-sm text-slate-600">
          <div>
            <p className="font-medium text-slate-800">IBKR 活动账单（推荐用于期货账户）</p>
            <p className="mt-1">从 IBKR 门户下载活动账单 CSV，系统自动提取账户号（如 U25840333），将开仓(O)和平仓(C)配对为完整交易，盈亏使用 IBKR 的「已实现损益」。</p>
          </div>
          <div>
            <p className="font-medium text-slate-800">TradeZella 通用格式</p>
            <p className="mt-1">字段：Symbol, Side, Entry/Exit Date, Price, Quantity, Fees, Account 等。适合手动录入或股票账户导出。</p>
          </div>
          <div>
            <p className="font-medium text-slate-800">多账户</p>
            <p className="mt-1">分别导入各账户的 CSV，顶部账户选择器可切换查看期货账户和股票账户的数据。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
