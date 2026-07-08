import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, X, LayoutGrid, TrendingUp, LineChart, Wallet, Upload,
  Pencil, Trash2, Settings2,
} from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/stats'
import type { AccountInfo, AccountType } from '../types'

const TYPE_META: Record<AccountType, { icon: typeof TrendingUp; badge: string; color: string }> = {
  futures: { icon: TrendingUp, badge: '期货', color: 'text-amber-600' },
  stock: { icon: LineChart, badge: '股票', color: 'text-sky-600' },
  other: { icon: Wallet, badge: '其他', color: 'text-slate-500' },
}

type ModalMode = 'add' | 'edit' | 'manage' | null

export function AccountTabs() {
  const {
    selectedAccount, setSelectedAccount, accountInfos,
    registerAccount, updateAccount, deleteAccount, journal,
  } = useTradeStore()

  const [modal, setModal] = useState<ModalMode>(null)
  const [editingAccount, setEditingAccount] = useState<AccountInfo | null>(null)
  const [formId, setFormId] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formType, setFormType] = useState<AccountType>('futures')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const allPnl = accountInfos.reduce((sum, a) => sum + a.totalPnl, 0)
  const allTrades = accountInfos.reduce((sum, a) => sum + a.tradeCount, 0)

  const openAdd = () => {
    setEditingAccount(null)
    setFormId('')
    setFormLabel('')
    setFormType('futures')
    setConfirmDelete(false)
    setModal('add')
  }

  const openEditAccount = (account: AccountInfo) => {
    setEditingAccount(account)
    setFormId(account.id)
    setFormLabel(account.label)
    setFormType(account.type)
    setConfirmDelete(false)
    setModal('edit')
  }

  const openEdit = (account: AccountInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    openEditAccount(account)
  }

  const openManage = () => {
    setConfirmDelete(false)
    setModal('manage')
  }

  const closeModal = () => {
    setModal(null)
    setEditingAccount(null)
    setConfirmDelete(false)
  }

  const handleAdd = () => {
    if (!formId.trim()) return
    registerAccount(formId.trim(), formLabel.trim() || formId.trim(), formType)
    closeModal()
  }

  const handleSaveEdit = () => {
    if (!editingAccount) return
    updateAccount(editingAccount.id, { label: formLabel, type: formType })
    closeModal()
  }

  const handleDelete = () => {
    if (!editingAccount) return
    deleteAccount(editingAccount.id)
    closeModal()
  }

  const editingJournalCount = editingAccount
    ? journal.filter((j) => j.account === editingAccount.id).length
    : 0

  return (
    <>
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-slate-200 bg-[#e8eaed] px-4 lg:-mx-8 lg:-mt-8">
        <div className="flex items-end gap-1 overflow-x-auto pb-0 pt-3 scrollbar-thin">
          <TabButton
            active={selectedAccount === 'all'}
            onClick={() => setSelectedAccount('all')}
            icon={LayoutGrid}
            title="全部账户"
            subtitle={`${allTrades} 笔 · ${formatCurrency(allPnl)}`}
            badge="汇总"
            badgeColor="text-brand-600"
          />

          {accountInfos.map((account) => {
            const meta = TYPE_META[account.type]
            return (
              <TabButton
                key={account.id}
                active={selectedAccount === account.id}
                onClick={() => setSelectedAccount(account.id)}
                onEdit={(e) => openEdit(account, e)}
                icon={meta.icon}
                title={account.label}
                subtitle={account.id !== account.label ? account.id : `${account.tradeCount} 笔`}
                badge={meta.badge}
                badgeColor={meta.color}
                trailing={
                  account.tradeCount > 0 ? (
                    <span className={cn('text-[10px] font-semibold', account.totalPnl >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {formatCurrency(account.totalPnl)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">无数据</span>
                  )
                }
              />
            )
          })}

          <button
            onClick={openAdd}
            title="添加账户"
            className="mb-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-t-lg text-slate-500 transition-colors hover:bg-white/60 hover:text-brand-600"
          >
            <Plus className="h-4 w-4" />
          </button>

          {accountInfos.length > 0 && (
            <button
              onClick={openManage}
              title="账户管理"
              className="mb-0.5 flex h-[38px] shrink-0 items-center gap-1.5 rounded-t-lg px-3 text-xs font-medium text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              管理
            </button>
          )}
        </div>
      </div>

      {/* 添加账户 */}
      {modal === 'add' && (
        <AccountModal title="添加账户" onClose={closeModal}>
          <div className="space-y-4">
            <Field label="账户 ID" hint="如 IBKR 账户号 U25840333，导入 CSV 时会自动匹配">
              <input value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="U25840333" className="form-input" autoFocus />
            </Field>
            <Field label="显示名称" hint="在标签页上显示的名字">
              <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="期货账户" className="form-input" />
            </Field>
            <TypePicker value={formType} onChange={setFormType} />
          </div>
          <ModalActions
            primaryLabel="添加"
            onPrimary={handleAdd}
            primaryDisabled={!formId.trim()}
            onCancel={closeModal}
          />
          <ImportHint onClose={closeModal} />
        </AccountModal>
      )}

      {/* 编辑账户 */}
      {modal === 'edit' && editingAccount && (
        <AccountModal title="编辑账户" onClose={closeModal}>
          <div className="space-y-4">
            <Field label="账户 ID">
              <input value={formId} disabled className="form-input cursor-not-allowed bg-slate-50 text-slate-500" />
            </Field>
            <Field label="显示名称">
              <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="期货账户" className="form-input" autoFocus />
            </Field>
            <TypePicker value={formType} onChange={setFormType} />

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {editingAccount.tradeCount} 笔交易 · {editingJournalCount} 条日记
            </div>
          </div>

          <ModalActions primaryLabel="保存" onPrimary={handleSaveEdit} onCancel={closeModal} />

          <div className="mt-6 border-t border-slate-100 pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                删除此账户
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">确定删除「{editingAccount.label}」？</p>
                <p className="mt-1 text-xs text-red-600">
                  将同时删除 {editingAccount.tradeCount} 笔交易和 {editingJournalCount} 条日记，此操作不可撤销。
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-red-200 bg-white py-2 text-sm text-slate-600 hover:bg-slate-50">
                    取消
                  </button>
                  <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700">
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </AccountModal>
      )}

      {/* 账户管理列表 */}
      {modal === 'manage' && (
        <AccountModal title="账户管理" onClose={closeModal}>
          <div className="space-y-2">
            {accountInfos.map((account) => {
              const meta = TYPE_META[account.type]
              const Icon = meta.icon
              const journalCount = journal.filter((j) => j.account === account.id).length
              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <div className={cn('rounded-lg bg-slate-100 p-2', meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{account.label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {account.id} · {meta.badge} · {account.tradeCount} 笔交易 · {journalCount} 条日记
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEditAccount(account)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-brand-600"
                      title="编辑"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`确定删除账户「${account.label}」及其所有交易和日记？`)) {
                          deleteAccount(account.id)
                        }
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => { closeModal(); openAdd() }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus className="h-4 w-4" />
            添加新账户
          </button>
        </AccountModal>
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  onEdit,
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeColor,
  trailing,
}: {
  active: boolean
  onClick: () => void
  onEdit?: (e: React.MouseEvent) => void
  icon: typeof TrendingUp
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  trailing?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex min-w-[140px] max-w-[200px] shrink-0 flex-col rounded-t-xl border px-4 py-2.5 text-left transition-all',
        active
          ? 'z-10 border-slate-200 border-b-white bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.04)]'
          : 'border-transparent bg-white/40 text-slate-600 hover:bg-white/70'
      )}
    >
      {onEdit && (
        <span
          role="button"
          tabIndex={0}
          onClick={onEdit}
          onKeyDown={(e) => e.key === 'Enter' && onEdit(e as unknown as React.MouseEvent)}
          title="编辑账户"
          className={cn(
            'absolute right-2 top-2 rounded-md p-0.5 transition-all',
            active
              ? 'text-slate-400 hover:bg-slate-100 hover:text-brand-600'
              : 'text-transparent group-hover:text-slate-400 group-hover:hover:bg-white/80 group-hover:hover:text-brand-600'
          )}
        >
          <Pencil className="h-3 w-3" />
        </span>
      )}
      <div className="flex items-center gap-2 pr-4">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? badgeColor : 'text-slate-400 group-hover:text-slate-500')} />
        <span className={cn('truncate text-sm font-semibold', active ? 'text-slate-900' : 'text-slate-600')}>
          {title}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-400">{subtitle}</span>
        {trailing}
      </div>
      <span className={cn('mt-1 text-[9px] font-medium uppercase tracking-wide', active ? badgeColor : 'text-slate-400')}>
        {badge}
      </span>
      {active && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-brand-500" />}
    </button>
  )
}

function TypePicker({ value, onChange }: { value: AccountType; onChange: (v: AccountType) => void }) {
  return (
    <Field label="账户类型">
      <div className="grid grid-cols-3 gap-2">
        {(['futures', 'stock', 'other'] as AccountType[]).map((type) => {
          const meta = TYPE_META[type]
          const Icon = meta.icon
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-xs font-medium transition-all',
                value === type
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <Icon className="h-4 w-4" />
              {meta.badge}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

function AccountModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({
  primaryLabel,
  onPrimary,
  onCancel,
  primaryDisabled,
}: {
  primaryLabel: string
  onPrimary: () => void
  onCancel: () => void
  primaryDisabled?: boolean
}) {
  return (
    <div className="mt-6 flex gap-3">
      <button onClick={onCancel} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        取消
      </button>
      <button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </div>
  )
}

function ImportHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-4 rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        添加后，前往
        <Link to="/import" onClick={onClose} className="mx-1 font-medium text-brand-600 hover:underline">
          Import CSV
        </Link>
        导入该账户的交易数据。
      </p>
      <Link to="/import" onClick={onClose} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
        <Upload className="h-3.5 w-3.5" />
        立即导入 CSV
      </Link>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  )
}
