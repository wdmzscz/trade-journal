import { useState, useCallback } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { parseCsvFile, downloadCsvTemplate } from '../utils/csvImport'
import type { Trade } from '../types'
import { PnlBadge } from '../components/PnlBadge'

export function ImportCsvPage() {
  const { importTrades } = useTradeStore()
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Trade[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrors(['请上传 CSV 格式文件'])
      return
    }
    const result = await parseCsvFile(file)
    setPreview(result.trades)
    setErrors(result.errors)
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
    importTrades(preview)
    setImported(true)
    setPreview([])
  }

  const totalPnl = preview.filter((t) => t.status === 'closed').reduce((s, t) => s + t.pnl, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import CSV</h1>
        <p className="mt-1 text-sm text-slate-500">从 CSV 文件批量导入交易记录（兼容 TradeZella 通用格式）</p>
      </div>

      {imported && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">导入成功！交易已添加到 Trades 列表。</span>
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
            <p className="text-xs text-slate-500">获取标准格式模板文件</p>
          </div>
        </button>

        <div className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">支持字段</p>
            <p className="text-xs text-slate-500">Symbol, Side, Entry/Exit Date, Price, Quantity, Fees, Setup, Tags...</p>
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
        <p className="mt-1 text-xs text-slate-400">或</p>
        <label className="mt-3 inline-block cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          选择文件
          <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
        </label>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">解析警告 ({errors.length})</span>
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
              <p className="text-sm text-slate-500">总盈亏 <PnlBadge value={totalPnl} className="ml-1" /></p>
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
                    <th className="px-4 py-3 font-medium">方向</th>
                    <th className="px-4 py-3 font-medium">入场日期</th>
                    <th className="px-4 py-3 font-medium">入场价</th>
                    <th className="px-4 py-3 font-medium">出场价</th>
                    <th className="px-4 py-3 font-medium">数量</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 text-right font-medium">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold">{trade.symbol}</td>
                      <td className="px-4 py-2.5">{trade.side === 'long' ? '做多' : '做空'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{trade.entryDate.slice(0, 10)}</td>
                      <td className="px-4 py-2.5">${trade.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}</td>
                      <td className="px-4 py-2.5">{trade.quantity}</td>
                      <td className="px-4 py-2.5">{trade.status === 'closed' ? '已平仓' : '持仓中'}</td>
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
        <h3 className="mb-3 font-semibold text-slate-900">CSV 格式说明</h3>
        <div className="space-y-2 text-sm text-slate-600">
          <p>• <strong>Symbol</strong>：标的代码（必填），如 AAPL、TSLA</p>
          <p>• <strong>Side</strong>：long / short（或 buy / sell）</p>
          <p>• <strong>Entry Date / Exit Date</strong>：日期格式 YYYY-MM-DD</p>
          <p>• <strong>Entry Price / Exit Price</strong>：入场价和出场价</p>
          <p>• <strong>Quantity</strong>：交易数量</p>
          <p>• <strong>Fees</strong>：手续费（可选）</p>
          <p>• <strong>Setup / Tags / Notes / Account / R Multiple</strong>：策略、标签、笔记等（可选）</p>
          <p>• 未填写 Exit Price 的交易将被标记为「持仓中」</p>
        </div>
      </div>
    </div>
  )
}
