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

function ts(value?: string): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function isNewerOrEqual(a?: string, b?: string): boolean {
  return ts(a) >= ts(b)
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

function mergeById<T>(
  local: T[],
  cloud: T[],
  getId: (item: T) => string,
  mergeItem: (localItem: T | undefined, cloudItem: T | undefined) => T,
  options?: {
    previousCloudIds?: Set<string>
    pendingDeleteIds?: Set<string>
  }
): T[] {
  const localMap = new Map(local.map((item) => [getId(item), item]))
  const cloudMap = new Map(cloud.map((item) => [getId(item), item]))
  const ids = new Set([...localMap.keys(), ...cloudMap.keys()])
  const merged: T[] = []

  for (const id of ids) {
    if (options?.pendingDeleteIds?.has(id)) continue

    const localItem = localMap.get(id)
    const cloudItem = cloudMap.get(id)

    if (cloudItem && localItem) {
      merged.push(mergeItem(localItem, cloudItem))
      continue
    }

    if (cloudItem) {
      merged.push(cloudItem)
      continue
    }

    if (!localItem) continue

    // 本地有、云端没有：首次同步或从未成功上传的记录保留；
    // 若上一轮云端有过、现在没了，视为对端已删除。
    const seenOnCloud = options?.previousCloudIds?.has(id) ?? false
    if (!seenOnCloud) {
      merged.push(localItem)
    }
  }

  return merged
}

export function mergePlaybookEntry(local?: PlaybookEntry, cloud?: PlaybookEntry): PlaybookEntry {
  if (!local) return cloud!
  if (!cloud) return local
  const base = isNewerOrEqual(local.updatedAt, cloud.updatedAt) ? local : cloud
  const other = base === local ? cloud : local
  return {
    ...other,
    ...base,
    charts: mergeChartLinks(other.charts, base.charts),
    thesis: base.thesis || other.thesis,
    lessons: base.lessons || other.lessons,
    setup: base.setup || other.setup,
    tags: base.tags.length > 0 ? base.tags : other.tags,
    pinned: base.pinned ?? other.pinned,
    outcome: base.outcome ?? other.outcome,
  }
}

export function mergeTradeRecord(local?: Trade, cloud?: Trade): Trade {
  if (!local) return cloud!
  if (!cloud) return local
  const base = isNewerOrEqual(local.updatedAt, cloud.updatedAt) ? local : cloud
  const other = base === local ? cloud : local
  return {
    ...other,
    ...base,
    entryCharts: mergeChartLinks(other.entryCharts, base.entryCharts),
    notes: base.notes || other.notes,
    setup: base.setup || other.setup,
    playbookId: base.playbookId || other.playbookId,
    tags: base.tags.length > 0 ? base.tags : other.tags,
  }
}

export function mergeJournalEntry(local?: JournalEntry, cloud?: JournalEntry): JournalEntry {
  if (!local) return cloud!
  if (!cloud) return local
  return isNewerOrEqual(local.updatedAt, cloud.updatedAt) ? local : cloud
}

export function mergeProfileRecord(local?: AccountProfile, cloud?: AccountProfile): AccountProfile {
  if (!local) return cloud!
  if (!cloud) return local
  return {
    ...local,
    ...cloud,
    paperSettings: cloud.paperSettings ?? local.paperSettings,
    startingCapital: cloud.startingCapital ?? local.startingCapital,
    currentCapital: cloud.currentCapital ?? local.currentCapital,
    totalDeposits: cloud.totalDeposits ?? local.totalDeposits,
    totalWithdrawals: cloud.totalWithdrawals ?? local.totalWithdrawals,
    cashFlows: cloud.cashFlows ?? local.cashFlows,
    navHistory: cloud.navHistory ?? local.navHistory,
    isPaper: cloud.isPaper ?? local.isPaper,
    label: cloud.label || local.label,
  }
}

function playbookContentKey(entry: PlaybookEntry): string {
  if (entry.tradeId?.trim()) return `trade:${entry.tradeId.trim()}`
  return [
    'case',
    entry.account.trim(),
    entry.symbol.trim().toUpperCase(),
    (entry.journalDate || entry.entryDate).slice(0, 10),
    entry.title.trim().toUpperCase(),
    entry.outcome ?? '',
  ].join('|')
}

function preferPlaybookCanonical(group: PlaybookEntry[], cloudIds?: Set<string>): PlaybookEntry {
  const onCloud = cloudIds ? group.filter((entry) => cloudIds.has(entry.id)) : []
  const pool = onCloud.length > 0 ? onCloud : group
  return pool.reduce((best, entry) => {
    const richer = countValidChartLinks(entry.charts) - countValidChartLinks(best.charts)
    if (richer !== 0) return richer > 0 ? entry : best
    return isNewerOrEqual(entry.updatedAt, best.updatedAt) ? entry : best
  })
}

/**
 * 同一笔交易或同一账户/标的/日期/标题只保留一条。
 * 多次重试、多设备各存一次会生成不同 id，按内容折叠，图表合并进留下的那条。
 */
export function dedupePlaybookEntries(
  entries: PlaybookEntry[],
  cloudIds?: Set<string>
): { entries: PlaybookEntry[]; droppedIds: string[] } {
  const groups = new Map<string, PlaybookEntry[]>()
  for (const entry of entries) {
    const key = playbookContentKey(entry)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }

  const kept: PlaybookEntry[] = []
  const droppedIds: string[] = []

  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0])
      continue
    }
    const canonical = preferPlaybookCanonical(group, cloudIds)
    const folded = group.reduce<PlaybookEntry>(
      (acc, item) => (item.id === acc.id ? acc : mergePlaybookEntry(acc, item)),
      canonical
    )
    const chartsMerged =
      countValidChartLinks(folded.charts) > countValidChartLinks(canonical.charts)
    kept.push({
      ...folded,
      id: canonical.id,
      updatedAt: chartsMerged ? new Date().toISOString() : folded.updatedAt,
      createdAt: group.reduce((earliest, item) =>
        ts(item.createdAt) > 0 && ts(item.createdAt) < ts(earliest) ? item.createdAt : earliest
      , canonical.createdAt),
    })
    for (const item of group) {
      if (item.id !== canonical.id) droppedIds.push(item.id)
    }
  }

  return { entries: kept, droppedIds }
}

export function mergeCloudCollections(
  local: CloudCollections,
  cloud: CloudCollections,
  options?: {
    previousCloudIds?: CloudIdSets
    pendingDeletes?: Partial<CloudIdSets>
  }
): CloudCollections {
  return mergeAndDedupeCloudCollections(local, cloud, options).merged
}

export function mergeAndDedupeCloudCollections(
  local: CloudCollections,
  cloud: CloudCollections,
  options?: {
    previousCloudIds?: CloudIdSets
    pendingDeletes?: Partial<CloudIdSets>
  }
): { merged: CloudCollections; droppedPlaybookIds: string[] } {
  const playbook = mergeById(local.playbook, cloud.playbook, (item) => item.id, mergePlaybookEntry, {
    previousCloudIds: options?.previousCloudIds?.playbook,
    pendingDeleteIds: options?.pendingDeletes?.playbook,
  })
  const deduped = dedupePlaybookEntries(playbook, new Set(cloud.playbook.map((item) => item.id)))
  const trades = mergeById(local.trades, cloud.trades, (item) => item.id, mergeTradeRecord, {
    previousCloudIds: options?.previousCloudIds?.trades,
    pendingDeleteIds: options?.pendingDeletes?.trades,
  }).map((trade) => {
    if (!trade.playbookId || !deduped.droppedIds.includes(trade.playbookId)) return trade
    const replacement = deduped.entries.find((entry) => entry.tradeId === trade.id)
    return replacement ? { ...trade, playbookId: replacement.id } : trade
  })

  return {
    merged: {
      trades,
      journal: mergeById(local.journal, cloud.journal, (item) => item.id, mergeJournalEntry, {
        previousCloudIds: options?.previousCloudIds?.journal,
        pendingDeleteIds: options?.pendingDeletes?.journal,
      }),
      profiles: mergeById(local.profiles, cloud.profiles, (item) => item.id, mergeProfileRecord, {
        previousCloudIds: options?.previousCloudIds?.profiles,
        pendingDeleteIds: options?.pendingDeletes?.profiles,
      }),
      playbook: deduped.entries,
    },
    droppedPlaybookIds: deduped.droppedIds,
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

function needsPush<T extends { id: string; updatedAt?: string }>(
  merged: T,
  cloudItem: T | undefined,
  richer: (mergedItem: T, cloudItem: T) => boolean
): boolean {
  if (!cloudItem) return true
  if (ts(merged.updatedAt) > ts(cloudItem.updatedAt)) return true
  return richer(merged, cloudItem)
}

/** 合并后需要补传到云端的记录（本地独有、更新、或图表更完整） */
export function recordsToPush(
  merged: CloudCollections,
  cloud: CloudCollections,
  seenCloudIds?: CloudIdSets
): CloudCollections {
  const cloudTrades = new Map(cloud.trades.map((item) => [item.id, item]))
  const cloudJournal = new Map(cloud.journal.map((item) => [item.id, item]))
  const cloudProfiles = new Map(cloud.profiles.map((item) => [item.id, item]))
  const cloudPlaybook = new Map(cloud.playbook.map((item) => [item.id, item]))

  const notResurrected = <T extends { id: string }>(item: T, cloudHas: boolean, seen?: Set<string>) =>
    cloudHas || !seen?.has(item.id)

  return {
    trades: merged.trades.filter((item) =>
      notResurrected(item, cloudTrades.has(item.id), seenCloudIds?.trades) &&
      needsPush(item, cloudTrades.get(item.id), (mergedItem, cloudItem) =>
        countValidChartLinks(mergedItem.entryCharts) > countValidChartLinks(cloudItem.entryCharts)
      )
    ),
    journal: merged.journal.filter((item) =>
      notResurrected(item, cloudJournal.has(item.id), seenCloudIds?.journal) &&
      needsPush(item, cloudJournal.get(item.id), () => false)
    ),
    profiles: merged.profiles.filter((item) => !cloudProfiles.has(item.id)),
    playbook: merged.playbook.filter((item) =>
      notResurrected(item, cloudPlaybook.has(item.id), seenCloudIds?.playbook) &&
      needsPush(item, cloudPlaybook.get(item.id), (mergedItem, cloudItem) =>
        countValidChartLinks(mergedItem.charts) > countValidChartLinks(cloudItem.charts)
      )
    ),
  }
}

/** 已对齐数据库后：只叠加上一次应用之后的未确认本地写入，不再整表并集 */
export function overlayUnconfirmedLocal(
  cloud: CloudCollections,
  local: CloudCollections,
  lastApplied: CloudCollections,
  pendingDeletes?: Partial<CloudIdSets>
): { merged: CloudCollections; droppedPlaybookIds: string[] } {
  const overlay = <T extends { id: string; updatedAt?: string }>(
    cloudItems: T[],
    localItems: T[],
    appliedItems: T[],
    pendingDeleteIds: Set<string> | undefined,
    mergeItem: (localItem: T | undefined, cloudItem: T | undefined) => T,
    richer?: (localItem: T, cloudItem: T) => boolean,
    options?: { allowUntimestampedEdits?: boolean }
  ): T[] => {
    const allowUntimestampedEdits = options?.allowUntimestampedEdits !== false
    const cloudMap = new Map(cloudItems.map((item) => [item.id, item]))
    const appliedMap = new Map(appliedItems.map((item) => [item.id, item]))
    const result = new Map(cloudItems.map((item) => [item.id, item]))

    for (const localItem of localItems) {
      if (pendingDeleteIds?.has(localItem.id)) continue
      const cloudItem = cloudMap.get(localItem.id)
      const applied = appliedMap.get(localItem.id)
      const unconfirmedCreate = !cloudItem && !applied
      const newerThanCloud = Boolean(cloudItem && ts(localItem.updatedAt) > ts(cloudItem.updatedAt))
      const newerThanApplied = Boolean(applied && ts(localItem.updatedAt) > ts(applied.updatedAt))
      const hasRicherData = Boolean(cloudItem && richer?.(localItem, cloudItem))
      const editedWithoutTimestamp = Boolean(
        allowUntimestampedEdits &&
        applied &&
        !localItem.updatedAt &&
        JSON.stringify(localItem) !== JSON.stringify(applied)
      )
      if (
        unconfirmedCreate ||
        newerThanCloud ||
        newerThanApplied ||
        hasRicherData ||
        editedWithoutTimestamp
      ) {
        result.set(localItem.id, mergeItem(localItem, cloudItem))
      }
    }

    for (const id of pendingDeleteIds ?? []) {
      result.delete(id)
    }

    return [...result.values()]
  }

  const playbook = overlay(
    cloud.playbook,
    local.playbook,
    lastApplied.playbook,
    pendingDeletes?.playbook,
    mergePlaybookEntry,
    (localItem, cloudItem) => countValidChartLinks(localItem.charts) > countValidChartLinks(cloudItem.charts)
  )
  const deduped = dedupePlaybookEntries(playbook, new Set(cloud.playbook.map((item) => item.id)))

  return {
    merged: {
      trades: overlay(
        cloud.trades,
        local.trades,
        lastApplied.trades,
        pendingDeletes?.trades,
        mergeTradeRecord,
        (localItem, cloudItem) =>
          countValidChartLinks(localItem.entryCharts) > countValidChartLinks(cloudItem.entryCharts)
      ).map((trade) => {
        if (!trade.playbookId || !deduped.droppedIds.includes(trade.playbookId)) return trade
        const replacement = deduped.entries.find((entry) => entry.tradeId === trade.id)
        return replacement ? { ...trade, playbookId: replacement.id } : trade
      }),
      journal: overlay(
        cloud.journal,
        local.journal,
        lastApplied.journal,
        pendingDeletes?.journal,
        mergeJournalEntry
      ),
      profiles: overlay(
        cloud.profiles,
        local.profiles,
        lastApplied.profiles,
        pendingDeletes?.profiles,
        mergeProfileRecord,
        undefined,
        { allowUntimestampedEdits: false }
      ),
      playbook: deduped.entries,
    },
    droppedPlaybookIds: deduped.droppedIds,
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
