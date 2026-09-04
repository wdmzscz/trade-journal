import type { AccountProfile, ChartLink, JournalEntry, PlaybookEntry, Trade } from '../types'
import { isValidChartUrl } from './chartLinks'

export type CloudCollections = {
  trades: Trade[]
  journal: JournalEntry[]
  profiles: AccountProfile[]
  playbook: PlaybookEntry[]
}

export type CloudIdSets = {
  trades: Set<string>
  journal: Set<string>
  profiles: Set<string>
  playbook: Set<string>
}

/** 合并图表：按槽位保留有效链接，避免空数组把已有 EVC 截图冲掉。后者覆盖同槽位。 */
export function mergeChartLinks(a?: ChartLink[], b?: ChartLink[]): ChartLink[] {
  const slots = new Map<string, ChartLink>()

  const add = (charts?: ChartLink[]) => {
    for (const chart of charts ?? []) {
      const timeframe = chart.timeframe.trim()
      const url = chart.url.trim()
      if (!timeframe || !url || !isValidChartUrl(url)) continue
      const existing = slots.get(timeframe)
      slots.set(timeframe, {
        timeframe,
        url,
        note: chart.note?.trim() || existing?.note,
      })
    }
  }

  add(a)
  add(b)
  return [...slots.values()]
}

export function countValidChartLinks(charts?: ChartLink[]): number {
  return mergeChartLinks(charts).length
}

export function emptyCloudIdSets(): CloudIdSets {
  return {
    trades: new Set(),
    journal: new Set(),
    profiles: new Set(),
    playbook: new Set(),
  }
}

export function cloudIdSetsFrom(data: CloudCollections): CloudIdSets {
  return {
    trades: new Set(data.trades.map((item) => item.id)),
    journal: new Set(data.journal.map((item) => item.id)),
    profiles: new Set(data.profiles.map((item) => item.id)),
    playbook: new Set(data.playbook.map((item) => item.id)),
  }
}

function applyCollection<T extends { id: string }>(
  cloudItems: T[],
  localItems: T[],
  pendingDeleteIds?: Set<string>,
  pendingWriteIds?: Set<string>
): T[] {
  const localMap = new Map(localItems.map((item) => [item.id, item]))
  const result = new Map<string, T>()

  for (const item of cloudItems) {
    if (pendingDeleteIds?.has(item.id)) continue
    const localItem = localMap.get(item.id)
    result.set(item.id, pendingWriteIds?.has(item.id) && localItem ? localItem : item)
  }

  for (const id of pendingWriteIds ?? []) {
    if (pendingDeleteIds?.has(id) || result.has(id)) continue
    const localItem = localMap.get(id)
    if (localItem) result.set(id, localItem)
  }

  return [...result.values()]
}

/** 以数据库为准，只叠加上传未完成的本机写入/删除 */
export function applyCloudWithPending(
  cloud: CloudCollections,
  local: CloudCollections,
  pendingDeletes?: Partial<CloudIdSets>,
  pendingWrites?: Partial<CloudIdSets>
): CloudCollections {
  return {
    trades: applyCollection(cloud.trades, local.trades, pendingDeletes?.trades, pendingWrites?.trades),
    journal: applyCollection(cloud.journal, local.journal, pendingDeletes?.journal, pendingWrites?.journal),
    profiles: applyCollection(cloud.profiles, local.profiles, pendingDeletes?.profiles, pendingWrites?.profiles),
    playbook: applyCollection(cloud.playbook, local.playbook, pendingDeletes?.playbook, pendingWrites?.playbook),
  }
}

/** 只补传这台设备尚未确认写进库的记录 */
export function recordsToPush(
  merged: CloudCollections,
  pendingWrites?: Partial<CloudIdSets>
): CloudCollections {
  return {
    trades: merged.trades.filter((item) => pendingWrites?.trades?.has(item.id)),
    journal: merged.journal.filter((item) => pendingWrites?.journal?.has(item.id)),
    profiles: merged.profiles.filter((item) => pendingWrites?.profiles?.has(item.id)),
    playbook: merged.playbook.filter((item) => pendingWrites?.playbook?.has(item.id)),
  }
}

export function hasRecordsToPush(data: CloudCollections): boolean {
  return (
    data.trades.length > 0 ||
    data.journal.length > 0 ||
    data.profiles.length > 0 ||
    data.playbook.length > 0
  )
}
