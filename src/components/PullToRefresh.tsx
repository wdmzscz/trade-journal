import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { cn } from '../utils/cn'

const THRESHOLD = 72
const MAX_PULL = 128

function isPageAtTop(scroller: HTMLElement) {
  return (
    scroller.scrollTop <= 0 &&
    window.scrollY <= 0 &&
    document.documentElement.scrollTop <= 0 &&
    document.body.scrollTop <= 0
  )
}

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
  const atTopRef = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const refreshFromCloudRef = useRef(refreshFromCloud)
  const cloudEnabledRef = useRef(cloudEnabled)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  refreshFromCloudRef.current = refreshFromCloud
  cloudEnabledRef.current = cloudEnabled

  useEffect(() => {
    const node = scrollerRef.current
    if (!node || !isMobile) return

    const setPullDistance = (value: number) => {
      pullRef.current = value
      setPull(value)
    }

    const abandon = () => {
      atTopRef.current = false
      setPullDistance(0)
    }

    const runRefresh = async () => {
      if (refreshingRef.current) return
      refreshingRef.current = true
      setRefreshing(true)
      setPullDistance(0)
      try {
        if (cloudEnabledRef.current && refreshFromCloudRef.current) {
          await refreshFromCloudRef.current()
        } else {
          window.location.reload()
          return
        }
      } catch (err) {
        console.warn('下拉刷新失败', err)
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        abandon()
      }
    }

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) {
        abandon()
        return
      }
      atTopRef.current = isPageAtTop(node)
      setPullDistance(0)
      if (!atTopRef.current) return
      const touch = event.touches[0]
      startXRef.current = touch.clientX
      startYRef.current = touch.clientY
    }

    const onMove = (event: TouchEvent) => {
      if (refreshingRef.current || !atTopRef.current) return
      if (!isPageAtTop(node)) {
        abandon()
        return
      }
      const touch = event.touches[0]
      const dx = touch.clientX - startXRef.current
      const dy = touch.clientY - startYRef.current
      if (Math.abs(dx) >= Math.abs(dy) || dy <= 0) {
        setPullDistance(0)
        return
      }
      setPullDistance(Math.min(MAX_PULL, dy * 0.42))
    }

    const onEnd = () => {
      const shouldRefresh =
        atTopRef.current && isPageAtTop(node) && pullRef.current >= THRESHOLD
      atTopRef.current = false
      if (shouldRefresh) {
        void runRefresh()
        return
      }
      setPullDistance(0)
    }

    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchmove', onMove, { passive: true })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      abandon()
      refreshingRef.current = false
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchmove', onMove)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onEnd)
    }
  }, [isMobile])

  return (
    <main ref={scrollerRef} className={cn('relative min-h-0', className)}>
      {isMobile && (pull > 0 || refreshing) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3 text-slate-500 dark:text-slate-400"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-1">
            <LoaderCircle className={cn('h-5 w-5', (refreshing || pull >= THRESHOLD) && 'animate-spin')} />
            <span className="text-[11px]">
              {refreshing ? '正在刷新…' : pull >= THRESHOLD ? '松开刷新' : '下拉刷新'}
            </span>
          </div>
        </div>
      )}
      <div
        style={
          pull > 0
            ? { transform: `translateY(${pull}px)`, transition: 'none' }
            : { transition: 'transform 180ms ease-out' }
        }
      >
        {children}
      </div>
    </main>
  )
}
