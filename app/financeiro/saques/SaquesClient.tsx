'use client'

/**
 * SaquesClient.tsx — Tela de Gestão de Saques (Painel Financeiro)
 * ─────────────────────────────────────────────────────────────────
 * Funcionalidades:
 *  • 3 cards de métricas (Aguardando, Pago no Mês, Total Solicitações)
 *  • Tabela com filtros por status e busca por nome/chave PIX
 *  • Botão "Aprovar e Pagar (PIX)" — chama POST /api/admin/withdrawals/:id/approve
 *  • Botão "Recusar" — abre modal com campo de motivo
 *  • Loading states e toasts de sucesso/erro
 *  • Suporte a dados reais (fetch) + fallback para mock data
 */

import React, { useCallback, useEffect, useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface WithdrawalUser {
  id:        string
  nome:      string
  email:     string
  role:      string
  telefone?: string
}

interface Withdrawal {
  id:          string
  amount:      number
  pixKey:      string
  pixKeyType:  string
  status:      WithdrawalStatus
  reviewNote?: string | null
  requestedAt: string
  processedAt?: string | null
  user:        WithdrawalUser | null
}

interface PaginationMeta {
  total: number
  page:  number
  pages: number
}

interface WithdrawalsResponse {
  success:        boolean
  data:           Withdrawal[]
  pagination:     PaginationMeta
  pendingSummary: { count: number; totalAmount: number }
}

// ─── Mock data (fallback quando API falha / para demos) ───────────────────────

const MOCK_DATA: Withdrawal[] = [
  {
    id: 'wd_001', amount: 250.00, pixKey: '11987651234', pixKeyType: 'PHONE',
    status: 'PENDING', requestedAt: new Date(Date.now() - 3_600_000).toISOString(),
    user: { id: 'u1', nome: 'Ana Beatriz Costa', email: 'ana@prospeclead.com', role: 'PROMOTER', telefone: '11987651234' },
  },
  {
    id: 'wd_002', amount: 500.00, pixKey: 'maria.silva@email.com', pixKeyType: 'EMAIL',
    status: 'PENDING', requestedAt: new Date(Date.now() - 7_200_000).toISOString(),
    user: { id: 'u2', nome: 'Maria Silva Santos', email: 'maria.silva@email.com', role: 'PARTNER_EMPLOYEE', telefone: '21976543210' },
  },
  {
    id: 'wd_003', amount: 175.50, pixKey: '432.876.543-21', pixKeyType: 'CPF',
    status: 'PENDING', requestedAt: new Date(Date.now() - 14_400_000).toISOString(),
    user: { id: 'u3', nome: 'Carlos Eduardo Lima', email: 'carlos@prospeclead.com', role: 'PROMOTER', telefone: '31965432109' },
  },
  {
    id: 'wd_004', amount: 80.00, pixKey: '3fa85f64-5717-4562-b3fc-2c963f66afa6', pixKeyType: 'EVP',
    status: 'PENDING', requestedAt: new Date(Date.now() - 86_400_000).toISOString(),
    user: { id: 'u4', nome: 'Roberto Alves Moura', email: 'roberto@email.com', role: 'PARTNER_EMPLOYEE', telefone: '47954321098' },
  },
  {
    id: 'wd_005', amount: 320.00, pixKey: 'patricia.lima@gmail.com', pixKeyType: 'EMAIL',
    status: 'PENDING', requestedAt: new Date(Date.now() - 172_800_000).toISOString(),
    user: { id: 'u5', nome: 'Patrícia Lima Ferreira', email: 'patricia@prospeclead.com', role: 'PROMOTER', telefone: '85943210987' },
  },
  {
    id: 'wd_006', amount: 640.00, pixKey: '11900012345', pixKeyType: 'PHONE',
    status: 'APPROVED', processedAt: new Date(Date.now() - 259_200_000).toISOString(),
    requestedAt: new Date(Date.now() - 345_600_000).toISOString(),
    reviewNote: 'PIX enviado com sucesso via Asaas.',
    user: { id: 'u6', nome: 'Fernando Souza Dias', email: 'fernando@email.com', role: 'PROMOTER', telefone: '11900012345' },
  },
  {
    id: 'wd_007', amount: 150.00, pixKey: 'juliana.melo@hotmail.com', pixKeyType: 'EMAIL',
    status: 'APPROVED', processedAt: new Date(Date.now() - 518_400_000).toISOString(),
    requestedAt: new Date(Date.now() - 604_800_000).toISOString(),
    reviewNote: 'Transferência efetuada.',
    user: { id: 'u7', nome: 'Juliana Melo Rocha', email: 'juliana@email.com', role: 'PARTNER_EMPLOYEE', telefone: '21988765432' },
  },
  {
    id: 'wd_008', amount: 90.00, pixKey: '111.222.333-44', pixKeyType: 'CPF',
    status: 'REJECTED', processedAt: new Date(Date.now() - 432_000_000).toISOString(),
    requestedAt: new Date(Date.now() - 518_400_000).toISOString(),
    reviewNote: 'CPF informado não confere com o cadastro.',
    user: { id: 'u8', nome: 'Thiago Nascimento Brito', email: 'thiago@email.com', role: 'PARTNER_EMPLOYEE', telefone: '62932109876' },
  },
]

// ─── Utilitários ──────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))

const roleLabel: Record<string, string> = {
  PROMOTER:         'Promotor',
  PARTNER_EMPLOYEE: 'Frentista',
  MANAGER:          'Gestor',
  FINANCIAL:        'Financeiro',
  ADMIN_MASTER:     'Admin',
}

const pixKeyTypeLabel: Record<string, string> = {
  CPF:   'CPF',
  CNPJ:  'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  EVP:   'Chave Aleatória',
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500',  'bg-rose-500', 'bg-cyan-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-pink-500',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}

function maskPixKey(key: string, type: string): string {
  if (type === 'CPF' && key.length >= 6)
    return key.slice(0, 3) + '.***.***-' + key.slice(-2)
  if (type === 'CNPJ' && key.length >= 6)
    return key.slice(0, 2) + '.***.***/****-' + key.slice(-2)
  if (type === 'EMAIL') {
    const [local, domain] = key.split('@')
    return (local?.slice(0, 2) ?? '**') + '***@' + (domain ?? '***')
  }
  if (type === 'PHONE' && key.length >= 4)
    return '(' + key.slice(0, 2) + ') ' + key.slice(2, 3) + '****-' + key.slice(-4)
  if (type === 'EVP' && key.length >= 8)
    return key.slice(0, 8) + '...'
  return key
}

// ─── Toast simples ────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'

interface Toast { id: number; type: ToastType; title: string; message: string }

function ToastList({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-xl border text-sm animate-fade-in ${
            t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            t.type === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
                                   'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <span className="text-lg mt-0.5">
            {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
          </span>
          <div className="flex-1">
            <p className="font-semibold">{t.title}</p>
            <p className="text-xs mt-0.5 opacity-75">{t.message}</p>
          </div>
          <button onClick={() => onClose(t.id)} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  )
}

// ─── Badge de status ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const cfg: Record<WithdrawalStatus, { label: string; cls: string; dot: string }> = {
    PENDING:   { label: 'Pendente',  cls: 'bg-amber-100 text-amber-800 border-amber-200',   dot: 'bg-amber-500'  },
    APPROVED:  { label: 'Aprovado',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
    REJECTED:  { label: 'Rejeitado', cls: 'bg-red-100 text-red-800 border-red-200',         dot: 'bg-red-500'    },
    CANCELLED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600 border-gray-200',      dot: 'bg-gray-400'   },
  }
  const { label, cls, dot } = cfg[status] ?? cfg.CANCELLED
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// ─── Modal de Rejeição ────────────────────────────────────────────────────────

function RejectModal({
  withdrawal,
  onConfirm,
  onClose,
  loading,
}: {
  withdrawal: Withdrawal
  onConfirm: (note: string) => void
  onClose: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl">🚫</div>
          <div>
            <h3 className="font-bold text-gray-900">Recusar Saque</h3>
            <p className="text-sm text-gray-500">
              {withdrawal.user?.nome} · {fmtBRL(withdrawal.amount)}
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
          ⚠️ O valor de {fmtBRL(withdrawal.amount)} será estornado para o saldo disponível do usuário.
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Motivo da recusa <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Ex: Chave PIX inválida, dados não conferem com cadastro..."
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">{reason.length}/200 caracteres</p>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading || reason.trim().length < 5}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processando…</>
            ) : (
              'Confirmar Recusa'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Confirmação de Aprovação ────────────────────────────────────────

function ApproveModal({
  withdrawal,
  onConfirm,
  onClose,
  loading,
}: {
  withdrawal: Withdrawal
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">💸</div>
          <div>
            <h3 className="font-bold text-gray-900">Aprovar e Pagar via PIX</h3>
            <p className="text-sm text-gray-500">{withdrawal.user?.nome}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Valor</span>
            <span className="font-bold text-emerald-700">{fmtBRL(withdrawal.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tipo da Chave</span>
            <span className="font-medium">{pixKeyTypeLabel[withdrawal.pixKeyType] ?? withdrawal.pixKeyType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Chave PIX</span>
            <span className="font-mono text-xs font-medium">{maskPixKey(withdrawal.pixKey, withdrawal.pixKeyType)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Função</span>
            <span className="font-medium">{roleLabel[withdrawal.user?.role ?? ''] ?? withdrawal.user?.role}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800">
          🔒 A transferência será processada via <strong>Asaas API</strong>. 
          Se o PIX falhar, o banco de dados <strong>não</strong> será alterado.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando PIX…</>
            ) : (
              '✅ Confirmar Pagamento'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de Métrica ──────────────────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, icon, color,
}: {
  title: string; value: string; subtitle: string; icon: string; color: string
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-shadow`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SaquesClient({ userRole }: { userRole: string }) {
  const isAdmin = userRole === 'ADMIN_MASTER'

  // Estado dos dados
  const [withdrawals,     setWithdrawals]     = useState<Withdrawal[]>([])
  const [pagination,      setPagination]      = useState<PaginationMeta>({ total: 0, page: 1, pages: 1 })
  const [pendingSummary,  setPendingSummary]  = useState({ count: 0, totalAmount: 0 })
  const [monthlyApproved, setMonthlyApproved] = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [usingMock,       setUsingMock]       = useState(false)

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [page,         setPage]         = useState(1)

  // Modais e ações
  const [approveTarget, setApproveTarget] = useState<Withdrawal | null>(null)
  const [rejectTarget,  setRejectTarget]  = useState<Withdrawal | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((type: ToastType, title: string, message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  // ─── Buscar dados ──────────────────────────────────────────────────────────
  const fetchWithdrawals = useCallback(async (statusArg: string, pageArg: number) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        status: statusArg === 'ALL' ? 'ALL' : statusArg,
        page:   String(pageArg),
        limit:  '20',
      })
      const res = await fetch(`/api/admin/withdrawals?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: WithdrawalsResponse = await res.json()
      if (!json.success) throw new Error('API error')

      setWithdrawals(json.data)
      setPagination(json.pagination)
      setPendingSummary(json.pendingSummary)
      setUsingMock(false)

      // Calcula aprovados no mês atual
      const now  = new Date()
      const paid = json.data.filter(w => {
        if (w.status !== 'APPROVED' || !w.processedAt) return false
        const d = new Date(w.processedAt)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      setMonthlyApproved(paid.reduce((s, w) => s + w.amount, 0))
    } catch {
      // Fallback para mock data em ambiente de desenvolvimento
      setWithdrawals(MOCK_DATA)
      setPagination({ total: MOCK_DATA.length, page: 1, pages: 1 })
      const pending = MOCK_DATA.filter(w => w.status === 'PENDING')
      setPendingSummary({ count: pending.length, totalAmount: pending.reduce((s, w) => s + w.amount, 0) })
      const now = new Date()
      const paid = MOCK_DATA.filter(w => {
        if (w.status !== 'APPROVED' || !w.processedAt) return false
        const d = new Date(w.processedAt)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      setMonthlyApproved(paid.reduce((s, w) => s + w.amount, 0))
      setUsingMock(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWithdrawals(statusFilter, page)
  }, [fetchWithdrawals, statusFilter, page])

  // ─── Aprovar saque ────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approveTarget) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/withdrawals/${approveTarget.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNote: 'Aprovado e pago via painel financeiro.' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Erro ao aprovar saque')
      }
      addToast('success', 'PIX enviado! 🎉', `${fmtBRL(approveTarget.amount)} para ${approveTarget.user?.nome ?? '—'}`)
      setApproveTarget(null)
      fetchWithdrawals(statusFilter, page)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      addToast('error', 'Falha no pagamento', msg)
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Rejeitar saque ───────────────────────────────────────────────────────
  const handleReject = async (note: string) => {
    if (!rejectTarget) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/withdrawals/${rejectTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECTED', reviewNote: note }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Erro ao rejeitar saque')
      }
      addToast('info', 'Saque recusado', `Valor de ${fmtBRL(rejectTarget.amount)} estornado para saldo do usuário.`)
      setRejectTarget(null)
      fetchWithdrawals(statusFilter, page)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      addToast('error', 'Falha ao recusar', msg)
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Filtragem por busca (client-side) ────────────────────────────────────
  const filtered = withdrawals.filter(w => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      w.user?.nome?.toLowerCase().includes(q) ||
      w.user?.email?.toLowerCase().includes(q) ||
      w.pixKey.toLowerCase().includes(q)
    )
  })

  // ─── Métricas dos mocks ───────────────────────────────────────────────────
  const totalCount = pagination.total

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              💸 Gestão de Saques
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Aprovação e processamento de saques via PIX para promotores e frentistas
            </p>
          </div>
          <button
            onClick={() => fetchWithdrawals(statusFilter, page)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            Atualizar
          </button>
        </div>
        {usingMock && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
            ⚠️ <strong>Modo demonstração:</strong> exibindo dados fictícios. A API pode estar indisponível.
          </div>
        )}
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Cards de métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            title="Aguardando Pagamento"
            value={fmtBRL(pendingSummary.totalAmount)}
            subtitle={`${pendingSummary.count} solicitação${pendingSummary.count !== 1 ? 'ões' : ''} pendente${pendingSummary.count !== 1 ? 's' : ''}`}
            icon="⏳"
            color="bg-amber-50"
          />
          <MetricCard
            title="Pago neste Mês"
            value={fmtBRL(monthlyApproved)}
            subtitle="Transferências PIX aprovadas no mês atual"
            icon="✅"
            color="bg-emerald-50"
          />
          <MetricCard
            title="Total de Solicitações"
            value={String(totalCount)}
            subtitle={`Registro histórico de ${statusFilter === 'ALL' ? 'todos os status' : 'saques ' + statusFilter.toLowerCase()}`}
            icon="📊"
            color="bg-blue-50"
          />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Busca */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou chave PIX…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* Filtro de status */}
            <div className="flex gap-2 flex-wrap">
              {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1) }}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                    statusFilter === s
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s === 'PENDING' ? '⏳ Pendentes' : s === 'APPROVED' ? '✅ Aprovados' : s === 'REJECTED' ? '❌ Rejeitados' : '📋 Todos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              Solicitações de Saque
              <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length} exibidos)</span>
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Carregando saques…</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-3">🎉</div>
                <p className="text-sm font-medium text-gray-600">Nenhum saque encontrado</p>
                <p className="text-xs text-gray-400 mt-1">Não há solicitações com o filtro selecionado</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    <th className="px-5 py-3">Solicitante</th>
                    <th className="px-4 py-3">Função</th>
                    <th className="px-4 py-3">Chave PIX</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                    {isAdmin && <th className="px-4 py-3 text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(w => {
                    const userName   = w.user?.nome ?? 'Usuário desconhecido'
                    const userRole   = w.user?.role ?? ''
                    const initials   = getInitials(userName)
                    const avatarColor = getAvatarColor(userName)

                    return (
                      <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                        {/* Solicitante */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate max-w-[160px]">{userName}</p>
                              <p className="text-xs text-gray-400 truncate max-w-[160px]">{w.user?.email ?? '—'}</p>
                            </div>
                          </div>
                        </td>

                        {/* Função */}
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                            {roleLabel[userRole] ?? userRole}
                          </span>
                        </td>

                        {/* Chave PIX */}
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-mono text-xs text-gray-800">{maskPixKey(w.pixKey, w.pixKeyType)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{pixKeyTypeLabel[w.pixKeyType] ?? w.pixKeyType}</p>
                          </div>
                        </td>

                        {/* Valor */}
                        <td className="px-4 py-4">
                          <span className="font-bold text-gray-900">{fmtBRL(w.amount)}</span>
                        </td>

                        {/* Data */}
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-gray-700">{fmtDate(w.requestedAt)}</p>
                            {w.processedAt && (
                              <p className="text-xs text-gray-400 mt-0.5">Processado: {fmtDate(w.processedAt)}</p>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <div>
                            <StatusBadge status={w.status} />
                            {w.reviewNote && (
                              <p className="text-xs text-gray-400 mt-1 max-w-[150px] truncate" title={w.reviewNote}>
                                {w.reviewNote}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Ações */}
                        {isAdmin && (
                          <td className="px-4 py-4">
                            {w.status === 'PENDING' ? (
                              <div className="flex items-center gap-2 justify-center">
                                <button
                                  onClick={() => setApproveTarget(w)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition shadow-sm whitespace-nowrap"
                                >
                                  💸 Aprovar e Pagar (PIX)
                                </button>
                                <button
                                  onClick={() => setRejectTarget(w)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 border border-red-200 transition whitespace-nowrap"
                                >
                                  🚫 Recusar
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {pagination.pages > 1 && (
            <div className="px-5 py-4 border-t flex items-center justify-between text-sm text-gray-600">
              <span>Página {pagination.page} de {pagination.pages} ({pagination.total} registros)</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition"
                >
                  ← Anterior
                </button>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nota informativa sobre o fluxo Asaas */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-800">
          <h3 className="font-semibold mb-2 flex items-center gap-2">🔒 Fluxo de Segurança dos Pagamentos</h3>
          <ul className="space-y-1 text-xs text-blue-700 list-none">
            <li>• <strong>Aprovação:</strong> a transferência PIX é enviada via <strong>Asaas API</strong> antes de qualquer alteração no banco</li>
            <li>• <strong>Falha no PIX:</strong> se a API Asaas retornar erro, o banco de dados <em>não</em> é alterado</li>
            <li>• <strong>Rejeição:</strong> o valor é automaticamente estornado para o saldo disponível do usuário</li>
            <li>• <strong>Optimistic Lock:</strong> o saldo usa versionamento para evitar race conditions em aprovações simultâneas</li>
          </ul>
        </div>
      </div>

      {/* Modais */}
      {approveTarget && (
        <ApproveModal
          withdrawal={approveTarget}
          onConfirm={handleApprove}
          onClose={() => !actionLoading && setApproveTarget(null)}
          loading={actionLoading}
        />
      )}
      {rejectTarget && (
        <RejectModal
          withdrawal={rejectTarget}
          onConfirm={handleReject}
          onClose={() => !actionLoading && setRejectTarget(null)}
          loading={actionLoading}
        />
      )}

      {/* Toasts */}
      <ToastList toasts={toasts} onClose={(id) => setToasts(p => p.filter(t => t.id !== id))} />
    </div>
  )
}
