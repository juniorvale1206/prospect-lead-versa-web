'use client'

/**
 * Dashboard de Comissões VAPEC 2026 v1.4
 *
 * Exibe:
 *  - Status do ciclo ativo (competência, datas, status)
 *  - Breakdown por Motor 1, 2 e 3
 *  - Compliance Motor 4 (validação por promotor)
 *  - Ranking de escalada Motor 1
 *  - Tabela de entradas individuais
 *  - Botões de gestão de ciclo (Closing → Closed → Paid)
 */

import { useEffect, useState, useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Cycle {
  id: string
  competencia: string
  startDate: string
  endDate: string
  financialCutoff: string
  recoveryWindowStart: string | null
  recoveryWindowEnd: string | null
  paymentDate: string | null
  status: string
  totalAmount: number
  totalEntries: number
  totalPromoters: number
  closingNotes: string | null
}

interface MotorBreakdown {
  MOTOR1: { total: number; count: number }
  MOTOR2: { total: number; count: number }
  MOTOR3: { total: number; count: number }
  MOTOR4_COMPLIANCE: { validated: number; blocked: number; pending: number }
}

interface PromoterSummary {
  userId: string
  userName: string
  motor1Total: number
  motor2Total: number
  motor3Total: number
  grandTotal: number
  pendingCount: number
  validatedCount: number
  salesCount: number
  careerLevel: string | null
  activePlates: number
}

interface CommissionEntry {
  id: string
  motor: string
  parcelaType: string
  baseValue: number
  percentage: number
  amount: number
  status: string
  fatorGerador: string | null
  careerLevel: string | null
  escalatedPercentage: number | null
  salesCountInCycle: number | null
  documentOk: boolean
  contractOk: boolean
  activationOk: boolean
  financialOk: boolean
  createdAt: string
  user: { id: string; nome: string; email: string }
  order: { id: string; orderNumber: string; clientName: string | null; planName: string | null } | null
  cycle: { id: string; competencia: string; status: string }
}

interface Motor1RankingItem {
  userId: string
  userName: string
  salesCount: number
  currentPercentage: number
  nextThreshold: number
  nextPercentage: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_CYCLE: Record<string, { label: string; color: string; icon: string }> = {
  OPEN: { label: 'Aberto', color: 'bg-blue-100 text-blue-700', icon: '🔵' },
  CLOSING: { label: 'Janela de Recuperação', color: 'bg-amber-100 text-amber-700', icon: '🟡' },
  CLOSED: { label: 'Fechado', color: 'bg-orange-100 text-orange-700', icon: '🔒' },
  PAID: { label: 'Pago', color: 'bg-green-100 text-green-700', icon: '✅' },
}

const STATUS_ENTRY: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-gray-100 text-gray-600' },
  VALIDATED: { label: 'Validado', color: 'bg-blue-100 text-blue-700' },
  PAID: { label: 'Pago', color: 'bg-green-100 text-green-700' },
  BLOCKED: { label: 'Bloqueado', color: 'bg-red-100 text-red-600' },
  GLOSA: { label: 'Glosado', color: 'bg-purple-100 text-purple-700' },
}

const MOTOR_COLORS: Record<string, string> = {
  MOTOR1: 'bg-blue-500',
  MOTOR2: 'bg-purple-500',
  MOTOR3: 'bg-amber-500',
}

const CAREER_BADGES: Record<string, string> = {
  BRONZE: '🥉 Bronze',
  PRATA: '🥈 Prata',
  OURO: '🥇 Ouro',
  DIAMANTE: '💎 Diamante',
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Componente: Compliance Modal ─────────────────────────────────────────────
function ComplianceModal({
  entry,
  onClose,
  onSave,
}: {
  entry: CommissionEntry
  onClose: () => void
  onSave: () => void
}) {
  const [checks, setChecks] = useState({
    documentOk: entry.documentOk,
    contractOk: entry.contractOk,
    activationOk: entry.activationOk,
    financialOk: entry.financialOk,
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status: string; missingItems: string[] } | null>(null)

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id, ...checks }),
      })
      const data = await res.json()
      setResult(data)
      if (data.status === 'VALIDATED') {
        setTimeout(() => { onSave(); onClose() }, 1500)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const allOk = Object.values(checks).every(Boolean)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Motor 4 — Compliance</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <div className="font-mono text-blue-700">{entry.order?.orderNumber ?? 'Entrada direta'}</div>
          <div className="text-gray-600">{entry.user.nome} · {entry.motor} / {entry.parcelaType}</div>
          <div className="font-semibold text-green-700 mt-1">{formatCurrency(entry.amount)}</div>
        </div>

        <div className="space-y-3 mb-5">
          {[
            { key: 'documentOk', label: '📄 Documentação completa', desc: 'RG/CPF ou CNPJ + contrato social' },
            { key: 'contractOk', label: '✍️ Contrato assinado', desc: 'Contrato de serviço assinado pelo cliente' },
            { key: 'activationOk', label: '📡 Ativação confirmada', desc: 'Equipamento instalado e ativado na plataforma' },
            { key: 'financialOk', label: '💰 Financeiro validado', desc: 'Sem inadimplência, pagamento confirmado' },
          ].map(({ key, label, desc }) => (
            <label key={key} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              checks[key as keyof typeof checks]
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="checkbox"
                checked={checks[key as keyof typeof checks]}
                onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
                className="w-5 h-5 rounded mt-0.5 accent-green-600"
              />
              <div>
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            </label>
          ))}
        </div>

        {result && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${
            result.status === 'VALIDATED'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {result.status === 'VALIDATED'
              ? '✅ Comissão validada com sucesso!'
              : `❌ Pendências: ${result.missingItems.join(', ')}`}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm">Fechar</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm text-white transition-colors disabled:opacity-50 ${
              allOk ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {loading ? 'Salvando...' : allOk ? '✅ Validar Comissão' : '⚠️ Salvar Pendências'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function ComissoesPage() {
  const [loading, setLoading] = useState(true)
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [motorBreakdown, setMotorBreakdown] = useState<MotorBreakdown | null>(null)
  const [promoters, setPromoters] = useState<PromoterSummary[]>([])
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({})
  const [entries, setEntries] = useState<CommissionEntry[]>([])
  const [ranking, setRanking] = useState<Motor1RankingItem[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'entries' | 'ranking' | 'cycles'>('overview')
  const [complianceEntry, setComplianceEntry] = useState<CommissionEntry | null>(null)
  const [cycleAction, setCycleAction] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [closingNotes, setClosingNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchDashboard = useCallback(async (cId?: string) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const cycleParam = cId ?? activeCycleId ?? ''
      const url = cycleParam
        ? `/api/admin/commissions?view=dashboard&cycleId=${cycleParam}`
        : '/api/admin/commissions?view=dashboard'

      const res = await fetch(url)
      const data = await res.json()

      if (data.cycles) {
        setCycles(data.cycles)
        setLoading(false)
        return
      }

      setActiveCycleId(data.activeCycle ?? cId ?? null)
      setCycle(data.cycle)
      setMotorBreakdown(data.motorBreakdown)
      setPromoters(data.promoterSummaries ?? [])
      setStatusBreakdown(data.statusBreakdown ?? {})
    } catch (e) {
      setErrorMsg('Erro ao carregar dashboard')
    } finally {
      setLoading(false)
    }
  }, [activeCycleId])

  const fetchEntries = useCallback(async () => {
    if (!activeCycleId) return
    try {
      const res = await fetch(`/api/admin/commissions?view=entries&cycleId=${activeCycleId}&limit=100`)
      const data = await res.json()
      setEntries(data.items ?? [])
    } catch {}
  }, [activeCycleId])

  const fetchRanking = useCallback(async () => {
    if (!activeCycleId) return
    try {
      const res = await fetch(`/api/admin/commissions?view=ranking&cycleId=${activeCycleId}`)
      const data = await res.json()
      setRanking(data.ranking ?? [])
    } catch {}
  }, [activeCycleId])

  const fetchCycles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/commission-cycles')
      const data = await res.json()
      setCycles(data.cycles ?? [])
    } catch {}
  }, [])

  useEffect(() => { fetchDashboard() }, [])

  useEffect(() => {
    if (activeTab === 'entries') fetchEntries()
    if (activeTab === 'ranking') fetchRanking()
    if (activeTab === 'cycles') fetchCycles()
  }, [activeTab, fetchEntries, fetchRanking, fetchCycles])

  const handleCycleAction = async (action: string) => {
    if (!activeCycleId) return
    if (action === 'close' && closingNotes.trim().length < 3) {
      setErrorMsg('Informe as observações do fechamento')
      return
    }
    setActionLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/commission-cycles/${activeCycleId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: closingNotes, paymentDate: new Date().toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCycleAction(null)
      setClosingNotes('')
      fetchDashboard(activeCycleId)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Erro')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateCycle = async () => {
    try {
      const res = await fetch('/api/admin/commission-cycles', { method: 'POST' })
      const data = await res.json()
      setActiveCycleId(data.id)
      fetchDashboard(data.id)
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
        Carregando comissões...
      </div>
    )
  }

  // Sem ciclo ativo
  if (!cycle) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">💰 Comissões VAPEC</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Nenhum Ciclo Ativo</h2>
          <p className="text-gray-500 mb-6">Crie o primeiro ciclo de competência VAPEC para começar a calcular comissões.</p>
          <button onClick={handleCreateCycle} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
            + Criar Ciclo de Competência
          </button>
          {cycles.length > 0 && (
            <div className="mt-6">
              <p className="text-sm text-gray-500 mb-3">Ciclos anteriores:</p>
              <div className="space-y-2">
                {cycles.slice(0, 5).map((c) => {
                  const cs = STATUS_CYCLE[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-600', icon: '●' }
                  return (
                    <button key={c.id} onClick={() => fetchDashboard(c.id)} className="w-full text-left px-4 py-3 border rounded-xl hover:bg-gray-50 flex items-center justify-between">
                      <span className="font-medium">{c.competencia}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cs.color}`}>{cs.icon} {cs.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const cycleStatus = STATUS_CYCLE[cycle.status] ?? { label: cycle.status, color: 'bg-gray-100 text-gray-600', icon: '●' }
  const totalCommissions = (motorBreakdown?.MOTOR1.total ?? 0) + (motorBreakdown?.MOTOR2.total ?? 0) + (motorBreakdown?.MOTOR3.total ?? 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Comissões VAPEC 2026</h1>
          <p className="text-sm text-gray-500 mt-1">Política v1.4 — 4 Motores de Comissionamento</p>
        </div>
        <div className="flex gap-2">
          {cycle.status === 'OPEN' && (
            <button onClick={() => setCycleAction('start_closing')} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600">
              🔔 Iniciar Fechamento
            </button>
          )}
          {(cycle.status === 'CLOSING' || cycle.status === 'OPEN') && (
            <button onClick={() => setCycleAction('close')} className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700">
              🔒 Fechar Ciclo
            </button>
          )}
          {cycle.status === 'CLOSED' && (
            <button onClick={() => setCycleAction('pay')} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">
              💸 Marcar como Pago
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">⚠️ {errorMsg}</div>
      )}

      {/* Ciclo Info */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-slate-400 text-sm uppercase font-semibold">Competência</div>
            <div className="text-3xl font-bold mt-1">{cycle.competencia}</div>
            <div className="text-slate-300 text-sm mt-1">
              {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${cycleStatus.color}`}>
              {cycleStatus.icon} {cycleStatus.label}
            </span>
            <div className="text-slate-300 text-sm mt-2">
              Corte Financeiro: <strong className="text-white">{formatDate(cycle.financialCutoff)}</strong>
            </div>
            {cycle.paymentDate && (
              <div className="text-slate-300 text-sm">
                Pagamento: <strong className="text-green-300">{formatDate(cycle.paymentDate)}</strong>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6 border-t border-slate-700 pt-4">
          <div className="text-center">
            <div className="text-slate-400 text-xs uppercase">Total Comissões</div>
            <div className="text-2xl font-bold text-green-300 mt-1">{formatCurrency(totalCommissions)}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400 text-xs uppercase">Entradas</div>
            <div className="text-2xl font-bold mt-1">{cycle.totalEntries}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400 text-xs uppercase">Promotores</div>
            <div className="text-2xl font-bold mt-1">{cycle.totalPromoters}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'overview', label: '📊 Visão Geral' },
          { key: 'entries', label: '📋 Entradas' },
          { key: 'ranking', label: '🏆 Ranking Motor 1' },
          { key: 'cycles', label: '📅 Ciclos' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Visão Geral */}
      {activeTab === 'overview' && motorBreakdown && (
        <div className="space-y-4">
          {/* Motors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['MOTOR1', 'MOTOR2', 'MOTOR3'] as const).map((motor) => {
              const data = motorBreakdown[motor]
              const labels: Record<string, string> = {
                MOTOR1: '🔵 Motor 1 — Planos Mensais',
                MOTOR2: '🟣 Motor 2 — Ganhos Diretos',
                MOTOR3: '🟡 Motor 3 — Carreira',
              }
              const descs: Record<string, string> = {
                MOTOR1: 'Base 10% + escala +3%/10 vendas',
                MOTOR2: '10% anuais/frota/acessórios · 5% franquias',
                MOTOR3: 'Bronze 3% → Diamante 6% ao mês',
              }
              return (
                <div key={motor} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="font-semibold text-gray-700 text-sm">{labels[motor]}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{descs[motor]}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-3">{formatCurrency(data.total)}</div>
                  <div className="text-xs text-gray-500 mt-1">{data.count} entradas</div>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${MOTOR_COLORS[motor]}`}
                      style={{ width: totalCommissions > 0 ? `${(data.total / totalCommissions) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {totalCommissions > 0 ? ((data.total / totalCommissions) * 100).toFixed(1) : 0}% do total
                  </div>
                </div>
              )
            })}
          </div>

          {/* Motor 4: Compliance */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 mb-3">🔒 Motor 4 — Compliance</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Pendentes</div>
                <div className="text-2xl font-bold text-amber-600">{motorBreakdown.MOTOR4_COMPLIANCE.pending}</div>
                <div className="text-xs text-gray-400">Aguardando validação</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Validados</div>
                <div className="text-2xl font-bold text-green-600">{motorBreakdown.MOTOR4_COMPLIANCE.validated}</div>
                <div className="text-xs text-gray-400">Compliance OK</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Bloqueados</div>
                <div className="text-2xl font-bold text-red-600">{motorBreakdown.MOTOR4_COMPLIANCE.blocked}</div>
                <div className="text-xs text-gray-400">Pendências doc/financeiro</div>
              </div>
            </div>
          </div>

          {/* Promotores */}
          {promoters.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="font-semibold text-gray-700">👥 Promotores no Ciclo</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Promotor</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 1</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 2</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 3</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nível</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {promoters.map((p) => (
                    <tr key={p.userId} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800">{p.userName}</div>
                        <div className="text-xs text-gray-400">{p.salesCount} vendas no ciclo</div>
                      </td>
                      <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(p.motor1Total)}</td>
                      <td className="px-4 py-3 text-right text-purple-700">{formatCurrency(p.motor2Total)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{formatCurrency(p.motor3Total)}</td>
                      <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(p.grandTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        {p.careerLevel
                          ? <span className="text-xs font-semibold">{CAREER_BADGES[p.careerLevel]}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          p.pendingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.pendingCount === 0 ? '✅ OK' : `${p.pendingCount} pendente${p.pendingCount > 1 ? 's' : ''}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Entradas */}
      {activeTab === 'entries' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">📋</div>
              <p>Nenhuma entrada de comissão neste ciclo</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Promotor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pedido</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Base</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">%</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((entry) => {
                  const es = STATUS_ENTRY[entry.status] ?? { label: entry.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 text-xs">{entry.user.nome}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-block w-2 h-2 rounded-full mr-1 ${MOTOR_COLORS[entry.motor] ?? 'bg-gray-400'}`} />
                        <span className="text-xs font-mono">{entry.motor}</span>
                        <div className="text-xs text-gray-400">{entry.parcelaType}</div>
                        {entry.careerLevel && <div className="text-xs">{CAREER_BADGES[entry.careerLevel]}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-blue-600">{entry.order?.orderNumber ?? '—'}</div>
                        <div className="text-xs text-gray-400">{entry.order?.clientName ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">{formatCurrency(entry.baseValue)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">{entry.percentage.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(entry.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${es.color}`}>{es.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(entry.status === 'PENDING' || entry.status === 'BLOCKED') && (
                          <button
                            onClick={() => setComplianceEntry(entry)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Motor 4
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Ranking Motor 1 */}
      {activeTab === 'ranking' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-700">🏆 Escalada Motor 1 — Planos Mensais</h3>
            <p className="text-xs text-gray-400 mt-0.5">Base 10% + 3% a cada 10 vendas válidas no ciclo</p>
          </div>
          {ranking.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>Nenhuma venda Motor 1 neste ciclo ainda</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Promotor</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Vendas</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">% Atual</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Próximo Nível</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranking.map((r, idx) => {
                  const progress = ((r.salesCount % 10) / 10) * 100
                  const remaining = r.nextThreshold - r.salesCount
                  return (
                    <tr key={r.userId} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-700' :
                            idx === 1 ? 'bg-gray-200 text-gray-600' :
                            idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-blue-50 text-blue-600'
                          }`}>{idx + 1}º</span>
                          <span className="font-medium text-gray-800">{r.userName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-blue-700">{r.salesCount}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          {r.currentPercentage}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.nextPercentage > r.currentPercentage ? (
                          <span className="text-xs text-gray-500">
                            {remaining} venda{remaining > 1 ? 's' : ''} para <strong className="text-green-600">{r.nextPercentage}%</strong>
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-semibold">🏆 Teto máximo</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{r.salesCount % 10}/10</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Ciclos */}
      {activeTab === 'cycles' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">📅 Histórico de Ciclos</h3>
            <button onClick={handleCreateCycle} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">+ Criar Ciclo</button>
          </div>
          {cycles.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Nenhum ciclo criado ainda</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Competência</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Período</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entradas</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cycles.map((c) => {
                  const cs = STATUS_CYCLE[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-600', icon: '●' }
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => {
                      setActiveCycleId(c.id)
                      fetchDashboard(c.id)
                      setActiveTab('overview')
                    }}>
                      <td className="px-5 py-3">
                        <div className="font-bold text-gray-800">{c.competencia}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(c.startDate)} → {formatDate(c.endDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">
                        {formatCurrency(c.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{c.totalEntries}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cs.color}`}>
                          {cs.icon} {cs.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Ação do Ciclo */}
      {cycleAction && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-3">
              {cycleAction === 'start_closing' && '🔔 Iniciar Janela de Recuperação'}
              {cycleAction === 'close' && '🔒 Fechar Ciclo Definitivamente'}
              {cycleAction === 'pay' && '💸 Registrar Pagamento'}
            </h3>
            {cycleAction === 'close' && (
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Observações do fechamento..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />
            )}
            {cycleAction === 'start_closing' && (
              <p className="text-sm text-gray-600 mb-4">
                O ciclo entrará em <strong>Janela de Recuperação (dias 12-15)</strong>. O financeiro poderá corrigir pendências antes do fechamento definitivo.
              </p>
            )}
            {cycleAction === 'pay' && (
              <p className="text-sm text-gray-600 mb-4">
                Todas as entradas <strong>VALIDATED</strong> serão marcadas como <strong>PAID</strong>. Esta ação registra o pagamento do <strong>20º dia útil</strong>.
              </p>
            )}
            {errorMsg && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>}
            <div className="flex gap-3">
              <button onClick={() => { setCycleAction(null); setErrorMsg('') }} className="flex-1 px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => handleCycleAction(cycleAction)} disabled={actionLoading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                {actionLoading ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Compliance */}
      {complianceEntry && (
        <ComplianceModal
          entry={complianceEntry}
          onClose={() => setComplianceEntry(null)}
          onSave={() => { fetchEntries(); fetchDashboard(activeCycleId ?? undefined) }}
        />
      )}
    </div>
  )
}
