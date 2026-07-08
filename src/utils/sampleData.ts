import { v4 as uuidv4 } from 'uuid'
import type { Trade } from '../types'
import { calculateTradePnl } from './stats'

export function createSampleTrades(): Trade[] {
  const now = new Date().toISOString()
  const samples: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    symbol: 'AAPL', side: 'long', status: 'closed',
    entryDate: '2024-06-03T09:35:00Z', exitDate: '2024-06-03T14:20:00Z',
    entryPrice: 192.5, exitPrice: 195.8, quantity: 100, fees: 2,
    pnl: 0, setup: 'Breakout', tags: ['momentum'], notes: 'Clean breakout above VWAP',
    account: 'Default',
  },
  {
    symbol: 'TSLA', side: 'short', status: 'closed',
    entryDate: '2024-06-04T10:15:00Z', exitDate: '2024-06-04T15:45:00Z',
    entryPrice: 178.2, exitPrice: 174.5, quantity: 50, fees: 1.5,
    pnl: 0, setup: 'Reversal', tags: ['reversal'], notes: 'Failed rally at resistance',
    account: 'Default',
  },
  {
    symbol: 'NVDA', side: 'long', status: 'closed',
    entryDate: '2024-06-05T09:45:00Z', exitDate: '2024-06-05T11:30:00Z',
    entryPrice: 1180, exitPrice: 1165, quantity: 10, fees: 3,
    pnl: 0, setup: 'Pullback', tags: ['pullback'], notes: 'Stopped out below support',
    account: 'Default',
  },
  {
    symbol: 'META', side: 'long', status: 'closed',
    entryDate: '2024-06-06T10:00:00Z', exitDate: '2024-06-06T15:30:00Z',
    entryPrice: 485, exitPrice: 492.5, quantity: 30, fees: 2,
    pnl: 0, setup: 'Breakout', tags: ['earnings'], notes: 'Post-earnings momentum',
    account: 'Default',
  },
  {
    symbol: 'AMD', side: 'long', status: 'closed',
    entryDate: '2024-06-07T09:30:00Z', exitDate: '2024-06-07T12:00:00Z',
    entryPrice: 162, exitPrice: 158.5, quantity: 75, fees: 2,
    pnl: 0, setup: 'Gap & Go', tags: ['gap'], notes: 'Gap fill reversal',
    account: 'Default',
  },
  {
    symbol: 'SPY', side: 'long', status: 'closed',
    entryDate: '2024-06-10T09:35:00Z', exitDate: '2024-06-10T16:00:00Z',
    entryPrice: 528, exitPrice: 531.2, quantity: 50, fees: 1,
    pnl: 0, setup: 'Trend', tags: ['index'], notes: 'Trend following day trade',
    account: 'Default',
  },
  {
    symbol: 'QQQ', side: 'short', status: 'closed',
    entryDate: '2024-06-11T10:30:00Z', exitDate: '2024-06-11T14:15:00Z',
    entryPrice: 455, exitPrice: 451.5, quantity: 40, fees: 1.5,
    pnl: 0, setup: 'Reversal', tags: ['index'], account: 'Default',
  },
  {
    symbol: 'MSFT', side: 'long', status: 'closed',
    entryDate: '2024-06-12T09:40:00Z', exitDate: '2024-06-12T11:00:00Z',
    entryPrice: 420, exitPrice: 425.5, quantity: 25, fees: 2,
    pnl: 0, setup: 'Breakout', tags: ['tech'], account: 'Default',
  },
  ]

  return samples.map((s) => {
    const pnl = s.status === 'closed' && s.exitPrice
      ? calculateTradePnl(s.side, s.entryPrice, s.exitPrice, s.quantity, s.fees)
      : 0
    return {
      ...s,
      id: uuidv4(),
      pnl,
      rMultiple: pnl > 0 ? 2 : pnl < 0 ? -1 : 0,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export function seedSampleData(): void {
  if (localStorage.getItem('trade-journal-trades')) return
  localStorage.setItem('trade-journal-trades', JSON.stringify(createSampleTrades()))
}
