import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { PerformanceScore } from '../types'
import { cn } from '../utils/cn'

type PerformanceScoreCardProps = {
  score: PerformanceScore
  className?: string
}

export function PerformanceScoreCard({ score, className }: PerformanceScoreCardProps) {
  const radarData = score.axes.map((axis) => ({
    metric: axis.label,
    value: axis.score,
    raw: axis.rawLabel,
  }))

  const markerLeft = `${Math.max(0, Math.min(100, score.overall))}%`

  return (
    <div className={cn('rounded-xl border border-surface-200 bg-white p-5 shadow-sm', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">综合评分</h3>
        <span className="text-xs text-slate-400">{score.closedTrades} 笔已平仓</span>
      </div>

      <div className="mx-auto h-64 w-full max-w-md">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="value"
              stroke="#6366f1"
              fill="#8b5cf6"
              fillOpacity={0.28}
              strokeWidth={2}
              dot={{ r: 3.5, fill: '#6366f1', stroke: '#fff', strokeWidth: 1.5 }}
            />
            <Tooltip
              formatter={(value: number, _name, item) => [
                `${value.toFixed(1)} / 100`,
                item?.payload?.raw ? `${item.payload.metric} (${item.payload.raw})` : '得分',
              ]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm text-slate-500">Your Trade Score</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{score.overall.toFixed(2)}</p>
        </div>

        <div className="relative pt-1">
          <div
            className="h-3 w-full rounded-full"
            style={{
              background:
                'linear-gradient(90deg, #ef4444 0%, #f59e0b 35%, #eab308 55%, #84cc16 75%, #22c55e 100%)',
            }}
          />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500 bg-white shadow"
            style={{ left: markerLeft, top: '0.625rem' }}
          />
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-slate-400">
            <span>0</span>
            <span>20</span>
            <span>40</span>
            <span>60</span>
            <span>80</span>
            <span>100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-xs text-slate-500 sm:grid-cols-3">
          {score.axes.map((axis) => (
            <div key={axis.key} className="flex items-center justify-between gap-2">
              <span className="truncate">{axis.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-slate-700">{axis.score.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
