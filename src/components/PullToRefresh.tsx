import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { cn } from '../utils/cn'

const THRESHOLD = 72
const MAX_PULL = 128

export function PullToRefresh({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { refreshFromCloud, cloudEnabled } = useTradeStore()
  const isMobile = useCoarsePointer()
  const scrollerRef = useRef<HTMLElement>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const pullingRef = useRef(false)
  const pullRef = useRef(0)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const setPullDistance = (value: number) => {
    pullRef.current = value
    setPull(value)
  }

  const runRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setPullDistance(THRESHOLD)
    try {
      if (cloudEnabled && refreshFromCloud) {
        await refreshFromCloud()
      } else {
        window.location.reload()
        return
      }
    } finally {
      setRefreshing(false)
      setPullDistance(0)
    }
  }, [cloudEnabled, refreshFromCloud, refreshing])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node || !isMobile) return

    const onStart = (event: TouchEvent) => {
      if (refreshing) return
      if (node.scrollTop > 1) return
      const touch = event.touches[0]
      startXRef.current = touch.clientX
      startYRef.current = touch.clientY
      pullingRef.current = true
    }

    const onMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshing) return
      const touch = event.touches[0]
      const dx = touch.clientX - startXRef.current
      const dy = touch.clientY - startYRef.current
      if (Math.abs(dx) > Math.abs(dy)) {
        pullingRef.current = false
        setPullDistance(0)
        return
      }
      if (node.scrollTop > 1) {
        pullingRef.current = false
        setPullDistance(0)
        return
      }
      if (dy <= 0) {
        setPullDistance(0)
        return
      }
      event.preventDefault()
      setPullDistance(Math.min(MAX_PULL, dy * 0.42))
    }

    const onEnd = () => {
      if (!pullingRef.current) return
      pullingRef.current = false
      if (pullRef.current >= THRESHOLD) {
        void runRefresh()
        return
      }
      setPullDistance(0)
    }

    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchmove', onMove, { passive: false })
    node.addEventListener('touchend', onEnd)
    node.addEventListener('touchcancel', onEnd)
    return () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchmove', onMove)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onEnd)
    }
  }, [isMobile, refreshing, runRefresh])

  const indicatorHeight = refreshing ? THRESHOLD : pull
  const ready = pull >= THRESHOLD || refreshing

  return (
    <main ref={scrollerRef} className={cn('overscroll-y-contain', className)}>
      {isMobile && (
        <div
          className="pointer-events-none flex items-end justify-center overflow-hidden text-slate-500 dark:text-slate-400"
          style={{ height: indicatorHeight }}
          aria-hidden
        >
          <div className="flex h-[72px] flex-col items-center justify-center gap-1">
            <LoaderCircle className={cn('h-5 w-5', (refreshing || ready) && 'animate-spin')} />
            <span className="text-[11px]">
              {refreshing ? '正在刷新…' : ready ? '松开刷新' : '下拉刷新'}
            </span>
          </div>
        </div>
      )}
      {children}
    </main>
  )
}
