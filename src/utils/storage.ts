import type { Trade, JournalEntry } from '../types'

/** 用于导入去重的交易指纹 */
export function tradeFingerprint(trade: Trade): string {
  return [
    trade.account,
    trade.symbol,
    trade.side,
    trade.entryDate.slice(0, 19),
    trade.exitDate?.slice(0, 19) ?? '',
    trade.entryPrice.toFixed(4),
    trade.exitPrice?.toFixed(4) ?? '',
    trade.quantity,
    trade.pnl.toFixed(2),
  ].join('|')
}

export function mergeTrades(existing: Trade[], incoming: Trade[]): { merged: Trade[]; added: number; skipped: number } {
  const fingerprints = new Set(existing.map(tradeFingerprint))
  const toAdd: Trade[] = []
  let skipped = 0

  for (const trade of incoming) {
    const fp = tradeFingerprint(trade)
    if (fingerprints.has(fp)) {
      skipped += 1
      continue
    }
    fingerprints.add(fp)
    toAdd.push(trade)
  }

  return { merged: [...toAdd, ...existing], added: toAdd.length, skipped }
}

export interface StorageStats {
  tradeCount: number
  journalCount: number
  accountCount: number
  estimatedBytes: number
  estimatedLabel: string
  limitLabel: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function getStorageStats(
  trades: Trade[],
  journal: JournalEntry[],
  accountProfiles: unknown[]
): StorageStats {
  const payload = JSON.stringify({ trades, journal, accountProfiles })
  const estimatedBytes = new Blob([payload]).size

  return {
    tradeCount: trades.length,
    journalCount: journal.length,
    accountCount: accountProfiles.length,
    estimatedBytes,
    estimatedLabel: formatBytes(estimatedBytes),
    limitLabel: '~5–10 MB（浏览器 localStorage 上限，通常可存数万笔交易）',
  }
}
