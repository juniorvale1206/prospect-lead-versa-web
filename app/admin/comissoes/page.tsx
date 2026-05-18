'use client'

/**
 * Dashboard de Comissões VAPEC 2026 v1.4 — ProspecLead Admin
 *
 * Exibe:
 *  - Status do ciclo ativo (competência, datas, status, botões de gestão)
 *  - Motor 1: escalada por promotor (vendas no ciclo → % escalonado)
 *  - Motor 2: ganhos diretos
 *  - Motor 3: carreira (placas ativas → Bronze/Prata/Ouro/Diamante + ranking)
 *  - Motor 4: compliance checklist interativo por promotor
 *  - Tabela de entradas individuais com filtros
 *  - Botões: Disparar Motor 3 / Iniciar Closing / Fechar Ciclo / Marcar como Pago
 */

import { useEffect, useState, useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Cycle {
  id: string; competencia: string; startDate: string; endDate: string
  financialCutoff: string; paymentDate: string | null; status: string
  totalAmount: number; totalEntries: number; totalPromoters: number; closingNotes: string | null
}

interface MotorBreakdown {
  MOTOR1: { total: number; count: number }
  MOTOR2: { total: number; count: number }
  MOTOR3: { total: number; count: number }
  MOTOR4_COMPLIANCE: { validated: number; blocked: number; pending: number }
}

interface PromoterSummary {
  userId: string; userName: string
  motor1Total: number; motor2Total: number; motor3Total: number; grandTotal: number
  pendingCount: number; validatedCount: number; salesCount: number
  careerLevel: string | null; activePlates: number
}

interface Motor1Rank {
  userId: string; userName: string; salesCount: number
  currentPercentage: number; nextThreshold: number; nextPercentage: number
}

interface Motor3Career {
  userId: string; userName: string
  careerLevel: string | null; activePlates: number; percentage: number
  totalAmount: number
}

interface CompliancePromoter {
  userId: string; userName: string; userEmail: string
  pendingCount: number; validatedCount: number; blockedCount: number
  totalAmount: number; complianceScore: number; allCompliant: boolean
  entries: ComplianceEntry[]
}

interface ComplianceEntry {
  id: string; motor: string; parcelaType: string
  amount: number; status: string; fatorGerador: string | null
  documentOk: boolean; contractOk: boolean; activationOk: boolean; financialOk: boolean; notes: string | null
  order: { id: string; orderNumber: string; clientName: string | null; planName: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

const CYCLE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  OPEN:    { label: 'Aberto',     color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  CLOSING: { label: 'Em Closing', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  CLOSED:  { label: 'Fechado',    color: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-500' },
  PAID:    { label: 'Pago',       color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
}

const CAREER_CONFIG: Record<string, { color: string; bg: string; icon: string; threshold: number; pct: number }> = {
  BRONZE:   { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200',  icon: '🥉', threshold: 300,  pct: 3 },
  PRATA:    { color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-300',      icon: '🥈', threshold: 600,  pct: 4 },
  OURO:     { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200',  icon: '🥇', threshold: 900,  pct: 5 },
  DIAMANTE: { color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',  icon: '💎', threshold: 1200, pct: 6 },
}

const MOTOR_ICONS: Record<string, string> = { MOTOR1: '⚡', MOTOR2: '💰', MOTOR3: '🏆', MOTOR4: '✅' }

// ─── Componentes auxiliares ───────────────────────────────────────────────────
function KPI({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{icon}</span>
      <div>
        <h2 className="font-bold text-gray-800">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function ComissoesPage() {
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null)
  const [cycle, setCycle]               = useState<Cycle | null>(null)
  const [motorBreakdown, setMotorBreakdown] = useState<MotorBreakdown | null>(null)
  const [promoterSummaries, setPromoterSummaries] = useState<PromoterSummary[]>([])
  const [motor1Ranking, setMotor1Ranking] = useState<Motor1Rank[]>([])
  const [motor3Career, setMotor3Career] = useState<Motor3Career[]>([])
  const [compliance, setCompliance]     = useState<CompliancePromoter[]>([])
  const [complianceTotals, setComplianceTotals] = useState<{ pending: number; validated: number; blocked: number; totalAmount: number } | null>(null)
  const [activeTab, setActiveTab]       = useState<'overview' | 'motor1' | 'motor3' | 'compliance' | 'entries'>('overview')
  const [loading, setLoading]           = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [expandedPromoter, setExpandedPromoter] = useState<string | null>(null)
  const [complianceSaving, setComplianceSaving] = useState('')
  const [cycleList, setCycleList]       = useState<Cycle[]>([])

  // ── Carregar dados do ciclo ──────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (cycleId?: string) => {
    setLoading(true)
    try {
      const url = cycleId
        ? `/api/admin/commissions?view=dashboard&cycleId=${cycleId}`
        : `/api/admin/commissions?view=dashboard`
      const res = await fetch(url)
      const data = await res.json()

      if (data.cycles) {
        // Nenhum ciclo ativo
        setCycleList(data.cycles)
        setCycle(null)
        setActiveCycleId(null)
        return
      }

      const cid = data.activeCycle ?? data.cycle?.id ?? cycleId
      setActiveCycleId(cid)
      setCycle(data.cycle)
      setMotorBreakdown(data.motorBreakdown)
      setPromoterSummaries(data.promoterSummaries ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const fetchMotor1Ranking = useCallback(async () => {
    if (!activeCycleId) return
    try {
      const res = await fetch(`/api/admin/commissions?view=ranking&cycleId=${activeCycleId}`)
      const data = await res.json()
      setMotor1Ranking(data.ranking ?? [])
    } catch {}
  }, [activeCycleId])

  const fetchMotor3 = useCallback(async () => {
    if (!activeCycleId) return
    try {
      const res = await fetch(`/api/admin/commissions/motor3?cycleId=${activeCycleId}`)
      const data = await res.json()
      setMotor3Career(data.careerRanking ?? [])
    } catch {}
  }, [activeCycleId])

  const fetchCompliance = useCallback(async () => {
    if (!activeCycleId) return
    try {
      const res = await fetch(`/api/admin/commissions/compliance?cycleId=${activeCycleId}`)
      const data = await res.json()
      setCompliance(data.promoters ?? [])
      setComplianceTotals(data.totals ?? null)
    } catch {}
  }, [activeCycleId])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  useEffect(() => {
    if (activeCycleId) {
      fetchMotor1Ranking()
      fetchMotor3()
      fetchCompliance()
    }
  }, [activeCycleId, fetchMotor1Ranking, fetchMotor3, fetchCompliance])

  // ── Ações de ciclo ───────────────────────────────────────────────────────────
  const handleStartClosing = async () => {
    if (!activeCycleId) return
    setActionLoading('closing')
    try {
      await fetch(`/api/admin/commission-cycles/${activeCycleId}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_closing' }),
      })
      await fetchDashboard(activeCycleId)
    } catch (e) { console.error(e) }
    finally { setActionLoading('') }
  }

  const handleCloseCycle = async () => {
    if (!activeCycleId || closingNotes.trim().length < 5) return
    setActionLoading('close')
    try {
      await fetch(`/api/admin/commission-cycles/${activeCycleId}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', notes: closingNotes }),
      })
      await fetchDashboard(activeCycleId)
      setClosingNotes('')
    } catch (e) { console.error(e) }
    finally { setActionLoading('') }
  }

  const handleMarkPaid = async () => {
    if (!activeCycleId) return
    setActionLoading('paid')
    try {
      await fetch(`/api/admin/commission-cycles/${activeCycleId}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', paymentDate: new Date().toISOString() }),
      })
      await fetchDashboard(activeCycleId)
    } catch (e) { console.error(e) }
    finally { setActionLoading('') }
  }

  const handleRunMotor3 = async () => {
    if (!activeCycleId) return
    setActionLoading('motor3')
    try {
      const res = await fetch('/api/admin/commissions/motor3', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId: activeCycleId }),
      })
      const data = await res.json()
      alert(`Motor 3 executado!\n${data.promotersEligible} promotores qualificados\nTotal Motor 3: ${fmt(data.totalMotor3)}`)
      await Promise.all([fetchDashboard(activeCycleId), fetchMotor3()])
    } catch (e) { console.error(e) }
    finally { setActionLoading('') }
  }

  // ── Compliance: validar entry ────────────────────────────────────────────────
  const handleComplianceSave = async (promoter: CompliancePromoter, doc: boolean, contract: boolean, activation: boolean, financial: boolean) => {
    setComplianceSaving(promoter.userId)
    try {
      await fetch('/api/admin/commissions/compliance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: promoter.userId,
          cycleId: activeCycleId,
          documentOk: doc, contractOk: contract, activationOk: activation, financialOk: financial,
        }),
      })
      await fetchCompliance()
    } catch (e) { console.error(e) }
    finally { setComplianceSaving('') }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        <span className="ml-3 text-gray-500">Carregando comissões...</span>
      </div>
    )
  }

  // Sem ciclo ativo
  if (!cycle) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Comissões VAPEC 2026 v1.4</h1>
          <p className="text-sm text-gray-500 mt-1">Motores 1–4 · Ciclo 26-25 · Pagamento 20º dia útil</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">Nenhum ciclo ativo</h2>
          <p className="text-sm text-gray-500 mb-4">O ciclo é criado automaticamente quando o primeiro pedido é processado no período.</p>
          {cycleList.length > 0 && (
            <div className="mt-6 text-left max-w-md mx-auto">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Ciclos anteriores:</p>
              {cycleList.slice(0, 5).map((c) => (
                <button key={c.id} onClick={() => fetchDashboard(c.id)}
                  className="w-full flex justify-between items-center px-4 py-2 mb-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">
                  <span className="font-semibold text-gray-700">{c.competencia}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${CYCLE_STATUS[c.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {CYCLE_STATUS[c.status]?.label ?? c.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const cycleStatusInfo = CYCLE_STATUS[cycle.status] ?? CYCLE_STATUS.OPEN
  const totalGeral = (motorBreakdown?.MOTOR1.total ?? 0) + (motorBreakdown?.MOTOR2.total ?? 0) + (motorBreakdown?.MOTOR3.total ?? 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Comissões VAPEC 2026 v1.4</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ciclo {cycle.competencia} · {fmtDate(cycle.startDate)} a {fmtDate(cycle.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${cycleStatusInfo.color}`}>
            <span className={`w-2 h-2 rounded-full ${cycleStatusInfo.dot}`} />
            {cycleStatusInfo.label}
          </span>
          {cycle.status === 'OPEN' && (
            <button onClick={handleRunMotor3} disabled={actionLoading === 'motor3'}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50">
              {actionLoading === 'motor3' ? '...' : '🏆 Calcular Motor 3'}
            </button>
          )}
          {['OPEN', 'CLOSING'].includes(cycle.status) && (
            <button onClick={handleStartClosing} disabled={actionLoading === 'closing'}
              className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg font-semibold hover:bg-yellow-700 disabled:opacity-50">
              {actionLoading === 'closing' ? '...' : '🔒 Iniciar Closing'}
            </button>
          )}
          {cycle.status === 'CLOSED' && (
            <button onClick={handleMarkPaid} disabled={actionLoading === 'paid'}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
              {actionLoading === 'paid' ? '...' : '💸 Marcar como Pago'}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Geral" value={fmt(totalGeral)} sub={`${cycle.totalEntries} entradas`} color="text-indigo-700" />
        <KPI label="Motor 1 ⚡" value={fmt(motorBreakdown?.MOTOR1.total ?? 0)}
          sub={`${motorBreakdown?.MOTOR1.count ?? 0} parcelas`} color="text-blue-700" />
        <KPI label="Motor 2 💰" value={fmt(motorBreakdown?.MOTOR2.total ?? 0)}
          sub={`${motorBreakdown?.MOTOR2.count ?? 0} ganhos`} color="text-green-700" />
        <KPI label="Motor 3 🏆" value={fmt(motorBreakdown?.MOTOR3.total ?? 0)}
          sub={`recorrência mensal`} color="text-purple-700" />
      </div>

      {/* Compliance summary strip */}
      {motorBreakdown && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap gap-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="text-sm text-gray-600">{motorBreakdown.MOTOR4_COMPLIANCE.pending} pendentes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-600">{motorBreakdown.MOTOR4_COMPLIANCE.validated} validadas (Motor 4)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-sm text-gray-600">{motorBreakdown.MOTOR4_COMPLIANCE.blocked} bloqueadas</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">Corte financeiro:</span>
            <span className="text-sm font-semibold text-gray-700">{fmtDate(cycle.financialCutoff)}</span>
          </div>
          {cycle.paymentDate && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Pagamento:</span>
              <span className="text-sm font-semibold text-green-700">{fmtDate(cycle.paymentDate)}</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-full overflow-x-auto">
        {([
          { id: 'overview',    label: '📊 Resumo' },
          { id: 'motor1',      label: '⚡ Motor 1' },
          { id: 'motor3',      label: '🏆 Motor 3 Carreira' },
          { id: 'compliance',  label: '✅ Motor 4 Compliance' },
          { id: 'entries',     label: '📋 Entradas' },
        ] as const).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Resumo por promotor ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <SectionTitle icon="👥" title="Resumo por Promotor" subtitle={`${promoterSummaries.length} promotores no ciclo`} />
          </div>
          {promoterSummaries.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <div className="text-4xl mb-2">👥</div>
              <p>Nenhum promotor com comissões neste ciclo</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Promotor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 1</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 2</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor 3</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Vendas</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {promoterSummaries.map((p) => {
                  const career = p.careerLevel ? CAREER_CONFIG[p.careerLevel] : null
                  return (
                    <tr key={p.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-semibold text-gray-800">{p.userName}</div>
                            {career && (
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${career.bg} ${career.color}`}>
                                {career.icon} {p.careerLevel}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">{fmt(p.motor1Total)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">{fmt(p.motor2Total)}</td>
                      <td className="px-4 py-3 text-right font-medium text-purple-700">{fmt(p.motor3Total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(p.grandTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                          {p.salesCount}
                          <span className="text-xs text-gray-400">vendas</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="text-xs space-y-0.5">
                          {p.validatedCount > 0 && <div className="text-green-600">✓ {p.validatedCount} ok</div>}
                          {p.pendingCount > 0 && <div className="text-yellow-600">⏳ {p.pendingCount}</div>}
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

      {/* ── Tab: Motor 1 — Escalada ──────────────────────────────────────────── */}
      {activeTab === 'motor1' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon="⚡" title="Motor 1 — Escalada de Vendas"
              subtitle="Base 10% +3% a cada 10 vendas válidas no ciclo (máx. 25%)" />
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[10, 13, 16, 19, 22, 25].map((pct, i) => (
                <div key={pct} className={`p-2 rounded-lg text-center text-xs border ${
                  i === 0 ? 'bg-gray-50 border-gray-200' : i < 3 ? 'bg-blue-50 border-blue-200' : 'bg-indigo-50 border-indigo-200'
                }`}>
                  <div className="font-bold text-sm text-gray-800">{pct}%</div>
                  <div className="text-gray-500 text-[10px]">{i === 0 ? '0-9 vendas' : `${i*10}+ vendas`}</div>
                </div>
              ))}
            </div>

            {motor1Ranking.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Nenhuma venda registrada neste ciclo</div>
            ) : (
              <div className="space-y-3">
                {motor1Ranking.map((r, i) => {
                  const progress = Math.min((r.salesCount / r.nextThreshold) * 100, 100)
                  const salesRemaining = r.nextThreshold - r.salesCount
                  return (
                    <div key={r.userId} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm text-gray-800">{r.userName}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-bold text-indigo-700 text-sm">{r.currentPercentage}%</span>
                            {r.currentPercentage < 25 && (
                              <span className="text-gray-400">→ {r.nextPercentage}% (faltam {salesRemaining} vendas)</span>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all ${
                            r.currentPercentage >= 25 ? 'bg-indigo-600' : r.currentPercentage >= 19 ? 'bg-blue-500' : 'bg-blue-400'
                          }`} style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                          <span>{r.salesCount} vendas no ciclo</span>
                          <span>próximo nível: {r.nextThreshold} vendas</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Motor 3 — Carreira ─────────────────────────────────────────── */}
      {activeTab === 'motor3' && (
        <div className="space-y-4">
          {/* Thresholds de carreira */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(CAREER_CONFIG).map(([level, cfg]) => (
              <div key={level} className={`rounded-xl border p-4 ${cfg.bg}`}>
                <div className="text-2xl mb-1">{cfg.icon}</div>
                <div className={`font-bold ${cfg.color}`}>{level}</div>
                <div className="text-sm text-gray-600">{cfg.threshold}+ placas ativas</div>
                <div className="text-lg font-bold mt-1 text-gray-800">{cfg.pct}%<span className="text-xs text-gray-500 font-normal">/mês</span></div>
              </div>
            ))}
          </div>

          {/* Ranking de carreira */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle icon="🏆" title="Ranking de Carreira"
                subtitle="Promotores qualificados para recorrência mensal Motor 3" />
              <button onClick={handleRunMotor3} disabled={actionLoading === 'motor3' || cycle.status === 'PAID'}
                className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50">
                {actionLoading === 'motor3' ? '⏳ Calculando...' : '▶ Recalcular Motor 3'}
              </button>
            </div>

            {motor3Career.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <div className="text-4xl mb-2">🏆</div>
                <p className="font-medium">Nenhum promotor qualificado no Motor 3</p>
                <p className="text-sm">É necessário mínimo de 300 placas ativas</p>
                <button onClick={handleRunMotor3} disabled={actionLoading === 'motor3'}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                  Calcular agora
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {motor3Career.map((p, i) => {
                  const cfg = p.careerLevel ? CAREER_CONFIG[p.careerLevel] : null
                  return (
                    <div key={p.userId} className={`flex items-center gap-4 p-4 rounded-xl border ${cfg?.bg ?? 'bg-gray-50 border-gray-200'}`}>
                      <div className="text-2xl">{cfg?.icon ?? '👤'}</div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <div>
                            <div className="font-bold text-gray-800">{p.userName}</div>
                            <div className={`text-xs font-semibold ${cfg?.color ?? 'text-gray-500'}`}>
                              {p.careerLevel ?? 'Sem nível'} · {p.activePlates} placas ativas
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg text-gray-900">{fmt(p.totalAmount)}</div>
                            <div className="text-xs text-gray-500">{p.percentage}% do MRR</div>
                          </div>
                        </div>
                        {/* Progress bar para próximo nível */}
                        {p.careerLevel !== 'DIAMANTE' && (
                          <div className="mt-2">
                            {(() => {
                              const levels = ['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'] as const
                              const idx = levels.indexOf(p.careerLevel as any)
                              const nextLevel = idx < 3 ? levels[idx + 1] : null
                              const nextThreshold = nextLevel ? CAREER_CONFIG[nextLevel].threshold : 1200
                              const progress = Math.min((p.activePlates / nextThreshold) * 100, 100)
                              return nextLevel ? (
                                <div>
                                  <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                                    <span>{p.activePlates} placas</span>
                                    <span>{nextLevel} em {nextThreshold} ({nextThreshold - p.activePlates} faltam)</span>
                                  </div>
                                  <div className="w-full bg-white/60 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                              ) : null
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Motor 4 — Compliance ────────────────────────────────────────── */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          {/* Totais */}
          {complianceTotals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Pendentes" value={String(complianceTotals.pending)} sub="aguardando validação" color="text-yellow-600" />
              <KPI label="Validadas ✅" value={String(complianceTotals.validated)} sub="compliance OK" color="text-green-700" />
              <KPI label="Bloqueadas ⛔" value={String(complianceTotals.blocked)} sub="compliance pendente" color="text-red-600" />
              <KPI label="Total Liberado" value={fmt(complianceTotals.totalAmount)} sub="entradas válidas" color="text-indigo-700" />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon="✅" title="Motor 4 — Compliance por Promotor"
              subtitle="Documentação · Contrato · Ativação · Validação financeira" />

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 mb-4">
              <strong>📋 Critérios Motor 4:</strong> Todos os 4 critérios devem ser aprovados para status VALIDATED.
              Entradas PENDING sem compliance serão bloqueadas no fechamento do ciclo.
            </div>

            {compliance.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <p>Nenhum promotor com entradas de comissão neste ciclo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {compliance.map((promoter) => {
                  const isExpanded = expandedPromoter === promoter.userId
                  const [doc, setDoc] = useState(promoter.entries.every((e) => e.documentOk))
                  const [contract, setContract] = useState(promoter.entries.every((e) => e.contractOk))
                  const [activation, setActivation] = useState(promoter.entries.every((e) => e.activationOk))
                  const [financial, setFinancial] = useState(promoter.entries.every((e) => e.financialOk))

                  const allOk = doc && contract && activation && financial
                  const scoreColor = promoter.complianceScore >= 100 ? 'text-green-700' : promoter.complianceScore >= 75 ? 'text-yellow-700' : 'text-red-600'

                  return (
                    <div key={promoter.userId} className={`border rounded-xl overflow-hidden ${
                      promoter.allCompliant ? 'border-green-200' : promoter.blockedCount > 0 ? 'border-red-200' : 'border-gray-200'
                    }`}>
                      <button
                        onClick={() => setExpandedPromoter(isExpanded ? null : promoter.userId)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                            promoter.allCompliant ? 'bg-green-500' : promoter.blockedCount > 0 ? 'bg-red-500' : 'bg-yellow-500'
                          }`}>
                            {promoter.allCompliant ? '✓' : promoter.blockedCount > 0 ? '✗' : '⏳'}
                          </div>
                          <div className="text-left">
                            <div className="font-semibold text-gray-800">{promoter.userName}</div>
                            <div className="text-xs text-gray-500">{promoter.userEmail}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right hidden sm:block">
                            <div className="font-bold text-gray-900">{fmt(promoter.totalAmount)}</div>
                            <div className="text-xs text-gray-400">{promoter.entries.length} entradas</div>
                          </div>
                          <div className={`text-right hidden md:block font-bold ${scoreColor}`}>
                            {promoter.complianceScore}%
                            <div className="text-xs font-normal text-gray-400">compliance</div>
                          </div>
                          <div className="flex gap-1 text-xs">
                            {promoter.validatedCount > 0 && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{promoter.validatedCount} ok</span>
                            )}
                            {promoter.pendingCount > 0 && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{promoter.pendingCount} pend.</span>
                            )}
                            {promoter.blockedCount > 0 && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{promoter.blockedCount} bloq.</span>
                            )}
                          </div>
                          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
                          {/* Checklist de compliance */}
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <p className="text-sm font-semibold text-gray-700 mb-3">Critérios Motor 4 — Aprovação em bloco</p>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                              {([
                                { key: 'doc', label: '📄 Documentação', state: doc, set: setDoc },
                                { key: 'contract', label: '✍️ Contrato assinado', state: contract, set: setContract },
                                { key: 'activation', label: '✅ Ativação confirmada', state: activation, set: setActivation },
                                { key: 'financial', label: '💳 Validação financeira', state: financial, set: setFinancial },
                              ] as const).map((item) => (
                                <label key={item.key} className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-all ${
                                  item.state ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
                                }`}>
                                  <input type="checkbox" checked={item.state} onChange={(e) => item.set(e.target.checked)}
                                    className="w-4 h-4 rounded accent-green-600" />
                                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                                  {item.state && <span className="ml-auto text-green-500 text-xs">✓</span>}
                                </label>
                              ))}
                            </div>
                            <button
                              onClick={() => handleComplianceSave(promoter, doc, contract, activation, financial)}
                              disabled={complianceSaving === promoter.userId}
                              className={`w-full py-2 rounded-lg text-sm font-bold text-white transition-colors ${
                                allOk ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                              } disabled:opacity-50`}>
                              {complianceSaving === promoter.userId ? 'Salvando...' :
                                allOk ? '✅ Aprovar todas as entradas' : '⛔ Bloquear entradas (critérios pendentes)'}
                            </button>
                          </div>

                          {/* Lista de entradas do promotor */}
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Entradas de Comissão</p>
                            {promoter.entries.map((entry) => (
                              <div key={entry.id} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
                                entry.status === 'VALIDATED' ? 'bg-green-50 border-green-200' :
                                entry.status === 'BLOCKED' ? 'bg-red-50 border-red-200' :
                                entry.status === 'PAID' ? 'bg-blue-50 border-blue-200' :
                                'bg-white border-gray-200'
                              }`}>
                                <span className="text-lg">{MOTOR_ICONS[entry.motor] ?? '💼'}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700 truncate">{entry.parcelaType}</span>
                                    <span className="font-bold text-gray-900 ml-2">{fmt(entry.amount)}</span>
                                  </div>
                                  {entry.fatorGerador && (
                                    <div className="text-xs text-gray-400 truncate">{entry.fatorGerador}</div>
                                  )}
                                  {entry.order && (
                                    <div className="text-xs text-gray-500">Pedido #{entry.order.orderNumber} · {entry.order.clientName}</div>
                                  )}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                                  entry.status === 'VALIDATED' ? 'bg-green-100 text-green-700' :
                                  entry.status === 'BLOCKED' ? 'bg-red-100 text-red-600' :
                                  entry.status === 'PAID' ? 'bg-blue-100 text-blue-700' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>{entry.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Entradas individuais ─────────────────────────────────────────── */}
      {activeTab === 'entries' && activeCycleId && <EntriesTab cycleId={activeCycleId} />}

      {/* Fechar ciclo (apenas CLOSING) */}
      {cycle.status === 'CLOSING' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-900 mb-2">🔒 Fechar Ciclo Definitivamente</h3>
          <p className="text-sm text-amber-700 mb-3">
            Após o fechamento, entradas PENDING sem compliance completo serão bloqueadas automaticamente.
          </p>
          <div className="flex gap-3">
            <input value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Observações do fechamento (mínimo 5 caracteres)..."
              className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button onClick={handleCloseCycle} disabled={actionLoading === 'close' || closingNotes.trim().length < 5}
              className="px-4 py-2 bg-amber-700 text-white rounded-lg font-bold text-sm hover:bg-amber-800 disabled:opacity-50">
              {actionLoading === 'close' ? 'Fechando...' : '🔐 Fechar Ciclo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab de entradas individuais ──────────────────────────────────────────────
function EntriesTab({ cycleId }: { cycleId: string }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [motorFilter, setMotorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ view: 'entries', cycleId, page: String(page), limit: '30' })
      if (motorFilter) params.set('motor', motorFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await window.fetch(`/api/admin/commissions?${params}`)
      const data = await res.json()
      setEntries(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch {} finally { setLoading(false) }
  }, [cycleId, motorFilter, statusFilter, page])

  useEffect(() => { fetch() }, [fetch])

  const STATUS_CLR: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700', VALIDATED: 'bg-green-100 text-green-700',
    PAID: 'bg-blue-100 text-blue-700', BLOCKED: 'bg-red-100 text-red-600', GLOSA: 'bg-gray-100 text-gray-500',
  }
  const fmt2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
        <select value={motorFilter} onChange={(e) => { setMotorFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">Todos os Motores</option>
          <option value="MOTOR1">⚡ Motor 1 — Planos Mensais</option>
          <option value="MOTOR2">💰 Motor 2 — Ganhos Diretos</option>
          <option value="MOTOR3">🏆 Motor 3 — Carreira</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">Todos os Status</option>
          <option value="PENDING">⏳ Pendente</option>
          <option value="VALIDATED">✅ Validado</option>
          <option value="PAID">💸 Pago</option>
          <option value="BLOCKED">⛔ Bloqueado</option>
          <option value="GLOSA">❌ Glosado</option>
        </select>
        <span className="ml-auto text-sm text-gray-500 self-center">{total} entradas</span>
      </div>
      {loading ? (
        <div className="py-10 text-center text-gray-400">Carregando...</div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-gray-400">Nenhuma entrada encontrada</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motor / Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Promotor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Fator Gerador</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">%</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e: any) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs font-semibold text-gray-600">{MOTOR_ICONS[e.motor]} {e.motor}</div>
                  <div className="text-xs text-gray-400">{e.parcelaType}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-700 text-xs">{e.user?.nome ?? '—'}</div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="text-xs text-gray-500 truncate max-w-xs">{e.fatorGerador ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{e.escalatedPercentage ?? e.percentage}%</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 text-sm">{fmt2(e.amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLR[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
