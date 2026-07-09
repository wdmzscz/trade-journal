import { useTradeStore } from '../hooks/useTradeStore'

import { getStorageStats } from '../utils/storage'

import { cn } from '../utils/cn'

import { Cloud, CloudOff, Loader2 } from 'lucide-react'



export function StorageInfo({ variant = 'light', className }: { variant?: 'light' | 'dark'; className?: string }) {

  const { trades, journal, accountProfiles, syncStatus, cloudEnabled } = useTradeStore()

  const stats = getStorageStats(trades, journal, accountProfiles)



  const isDark = variant === 'dark'



  const syncLabel = {

    idle: cloudEnabled ? '已同步' : null,

    loading: '加载中…',

    syncing: '同步中…',

    error: '同步失败',

  }[syncStatus]



  return (

    <div className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-500', className)}>

      <div className="flex items-center gap-1.5">

        {cloudEnabled ? (

          syncStatus === 'syncing' || syncStatus === 'loading' ? (

            <Loader2 className="h-3 w-3 animate-spin text-brand-400" />

          ) : syncStatus === 'error' ? (

            <CloudOff className="h-3 w-3 text-red-400" />

          ) : (

            <Cloud className="h-3 w-3 text-green-400" />

          )

        ) : null}

        <p className={cn('font-medium', isDark ? 'text-slate-400' : 'text-slate-600')}>

          {cloudEnabled ? '云端同步' : '本地存储'}

        </p>

        {syncLabel && (

          <span

            className={cn(

              'text-[10px]',

              syncStatus === 'error' ? 'text-red-400' : 'text-slate-500'

            )}

          >

            · {syncLabel}

          </span>

        )}

      </div>

      <p className="mt-1">

        {stats.tradeCount} 笔交易 · {stats.journalCount} 条日记 · {stats.estimatedLabel}

      </p>

      <p className="mt-1 opacity-80">

        {cloudEnabled

          ? '数据保存在云端，任意设备登录即可同步'

          : '数据保存在本浏览器，换设备需重新导入'}

      </p>

    </div>

  )

}

