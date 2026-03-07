'use client'

/**
 * /app/admin/leads/pdv/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel de Leads PDV — Rede de Parceiros
 *
 * Cards de métricas:
 *   1. Total de leads no mês atual (com variação vs mês anterior)
 *   2. Breakdown por origem: QR Code vs Cadastro Manual (frentista)
 *   3. Top 3 PDVs por volume de leads (ranking com taxa de conversão)
 *
 * Tabela com colunas:
 *   Data/Hora | Cliente (nome + telefone) | Tipo | PDV (nome + cidade) |
 *   Promotor | Origem (badge) | Funil | Status | Ações
 *
 * Filtros:
 *   Origem (QR Code / Manual / Todos) | Período (mês atual / trimestre / custom) |
 *   PDV específico | Busca por nome/telefone
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceType = 'QR_CODE_PDV' | 'MANUAL_PDV' | 'PDV'
type FunnelStage =
  | 'LEAD_COLETADO'
  | 'IA_EM_ATENDIMENTO'
  | 'REUNIAO_AGENDADA'
  | 'PROPOSTA_ENVIADA'
  | 'CONVERTIDO'
  | 'PERDIDO'
type LeadStatus = 'PENDENTE_AUDITORIA' | 'AUDITADO_APROVADO' | 'AUDITADO_REJEITADO'

interface PdvInfo {
  id: string
  name: string
  cidade: string | null
  uf: string | null
  storeType: string
  totalLeads: number
  totalSales: number
}

interface PromotorInfo {
  id: string
  nome: string
  email: string
  role: string
}

interface PdvLead {
  id: string
  nomeCliente: string
  telefone: string | null
  email: string | null
  veiculo: string
  placa: string
  leadType: string
  sourceType: SourceType
  sourceLabel: string
  funnelStage: FunnelStage
  iaStatus: string | null
  status: LeadStatus
  createdAt: string
  pdv: PdvInfo | null
  promotor: PromotorInfo | null
}

interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

interface SourceBreakdown {
  sourceType: string
  label: string
  count: number
  pct: number
}

interface PdvRanking {
  rank: number
  pdvId: string
  pdvName: string
  cidade: string | null
  uf: string | null
  storeType: string
  leadsCount: number
  converted: number
  convRate: number
  promotorNome: string | null
  promotorId: string | null
}

interface DailyPoint {
  date: string
  total: number
  qrCode: number
  manual: number
}

interface Stats {
  totalLeadsMonth: number
  totalLeadsPrevMonth: number
  monthGrowthPct: number
  totalLeadsAllTime: number
  totalConverted: number
  conversionRate: number
  bySource: SourceBreakdown[]
  topPdvs: PdvRanking[]
  dailyTrend: DailyPoint[]
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_STATS: Stats = {
  totalLeadsMonth: 87,
  totalLeadsPrevMonth: 64,
  monthGrowthPct: 35.9,
  totalLeadsAllTime: 342,
  totalConverted: 89,
  conversionRate: 26,
  bySource: [
    { sourceType: 'QR_CODE_PDV', label: 'QR Code (Passivo)', count: 61, pct: 70 },
    { sourceType: 'MANUAL_PDV',  label: 'Cadastro Manual (Frentista)', count: 22, pct: 25 },
    { sourceType: 'PDV',         label: 'PDV (Legado)', count: 4, pct: 5 },
  ],
  topPdvs: [
    {
      rank: 1, pdvId: 'pdv-1', pdvName: 'Posto Ipiranga Centro', cidade: 'Belo Horizonte',
      uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', leadsCount: 34, converted: 9, convRate: 26,
      promotorNome: 'Carlos Silva', promotorId: 'pr-1',
    },
    {
      rank: 2, pdvId: 'pdv-2', pdvName: 'Auto Posto BR-040', cidade: 'Contagem',
      uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', leadsCount: 27, converted: 6, convRate: 22,
      promotorNome: 'Ana Ferreira', promotorId: 'pr-2',
    },
    {
      rank: 3, pdvId: 'pdv-3', pdvName: 'Posto Shell Savassi', cidade: 'Belo Horizonte',
      uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', leadsCount: 19, converted: 5, convRate: 26,
      promotorNome: 'Marcus Oliveira', promotorId: 'pr-3',
    },
  ],
  dailyTrend: Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i))
    const qrCode = Math.floor(Math.random() * 5)
    const manual = Math.floor(Math.random() * 2)
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: qrCode + manual,
      qrCode,
      manual,
    }
  }),
}

const MOCK_LEADS: PdvLead[] = [
  {
    id: 'l1', nomeCliente: 'Roberto Mendes', telefone: '(31) 98877-1234',
    email: 'roberto@email.com', veiculo: 'Honda Civic 2021', placa: 'PBH-1234',
    leadType: 'B2C', sourceType: 'QR_CODE_PDV', sourceLabel: 'QR Code (Passivo)',
    funnelStage: 'IA_EM_ATENDIMENTO', iaStatus: 'RESPONDIDO', status: 'AUDITADO_APROVADO',
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    pdv: { id: 'pdv-1', name: 'Posto Ipiranga Centro', cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 34, totalSales: 9 },
    promotor: { id: 'pr-1', nome: 'Carlos Silva', email: 'carlos@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l2', nomeCliente: 'Fernanda Souza', telefone: '(31) 97766-5678',
    email: null, veiculo: 'Toyota Corolla 2020', placa: 'ABC-5678',
    leadType: 'B2C', sourceType: 'MANUAL_PDV', sourceLabel: 'Cadastro Manual (Frentista)',
    funnelStage: 'REUNIAO_AGENDADA', iaStatus: 'QUALIFICADO', status: 'AUDITADO_APROVADO',
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    pdv: { id: 'pdv-1', name: 'Posto Ipiranga Centro', cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 34, totalSales: 9 },
    promotor: { id: 'pr-1', nome: 'Carlos Silva', email: 'carlos@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l3', nomeCliente: 'Paulo Rodrigues', telefone: '(31) 96655-9012',
    email: 'paulo.rodrigues@empresa.com', veiculo: 'Ford Ranger 2022', placa: 'DEF-9012',
    leadType: 'B2C', sourceType: 'QR_CODE_PDV', sourceLabel: 'QR Code (Passivo)',
    funnelStage: 'LEAD_COLETADO', iaStatus: null, status: 'PENDENTE_AUDITORIA',
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    pdv: { id: 'pdv-2', name: 'Auto Posto BR-040', cidade: 'Contagem', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 27, totalSales: 6 },
    promotor: { id: 'pr-2', nome: 'Ana Ferreira', email: 'ana@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l4', nomeCliente: 'Juliana Lima', telefone: '(11) 95544-3456',
    email: null, veiculo: 'Hyundai HB20 2019', placa: 'GHI-3456',
    leadType: 'B2C', sourceType: 'QR_CODE_PDV', sourceLabel: 'QR Code (Passivo)',
    funnelStage: 'CONVERTIDO', iaStatus: 'QUALIFICADO', status: 'AUDITADO_APROVADO',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    pdv: { id: 'pdv-2', name: 'Auto Posto BR-040', cidade: 'Contagem', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 27, totalSales: 6 },
    promotor: { id: 'pr-2', nome: 'Ana Ferreira', email: 'ana@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l5', nomeCliente: 'Marcelo Santos', telefone: '(31) 94433-7890',
    email: 'marcelo@email.com', veiculo: 'Chevrolet Onix 2023', placa: 'JKL-7890',
    leadType: 'B2C', sourceType: 'MANUAL_PDV', sourceLabel: 'Cadastro Manual (Frentista)',
    funnelStage: 'LEAD_COLETADO', iaStatus: null, status: 'PENDENTE_AUDITORIA',
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    pdv: { id: 'pdv-3', name: 'Posto Shell Savassi', cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 19, totalSales: 5 },
    promotor: { id: 'pr-3', nome: 'Marcus Oliveira', email: 'marcus@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l6', nomeCliente: 'Tatiana Alves', telefone: '(31) 93322-1234',
    email: 'tati@email.com', veiculo: 'Jeep Compass 2021', placa: 'MNO-1234',
    leadType: 'B2C', sourceType: 'QR_CODE_PDV', sourceLabel: 'QR Code (Passivo)',
    funnelStage: 'PROPOSTA_ENVIADA', iaStatus: 'QUALIFICADO', status: 'AUDITADO_APROVADO',
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    pdv: { id: 'pdv-3', name: 'Posto Shell Savassi', cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 19, totalSales: 5 },
    promotor: { id: 'pr-3', nome: 'Marcus Oliveira', email: 'marcus@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l7', nomeCliente: 'Diego Martins', telefone: '(31) 92211-5678',
    email: null, veiculo: 'VW Gol 2018', placa: 'PQR-5678',
    leadType: 'B2C', sourceType: 'QR_CODE_PDV', sourceLabel: 'QR Code (Passivo)',
    funnelStage: 'PERDIDO', iaStatus: 'DESQUALIFICADO', status: 'AUDITADO_REJEITADO',
    createdAt: new Date(Date.now() - 36 * 3600000).toISOString(),
    pdv: { id: 'pdv-1', name: 'Posto Ipiranga Centro', cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 34, totalSales: 9 },
    promotor: { id: 'pr-1', nome: 'Carlos Silva', email: 'carlos@rastremix.com', role: 'PROMOTER' },
  },
  {
    id: 'l8', nomeCliente: 'Sandra Pereira', telefone: '(11) 91100-9012',
    email: 'sandra@empresa.com', veiculo: 'Renault Duster 2020', placa: 'STU-9012',
    leadType: 'B2C', sourceType: 'MANUAL_PDV', sourceLabel: 'Cadastro Manual (Frentista)',
    funnelStage: 'IA_EM_ATENDIMENTO', iaStatus: 'EM_ATENDIMENTO', status: 'PENDENTE_AUDITORIA',
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    pdv: { id: 'pdv-2', name: 'Auto Posto BR-040', cidade: 'Contagem', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL', totalLeads: 27, totalSales: 6 },
    promotor: { id: 'pr-2', nome: 'Ana Ferreira', email: 'ana@rastremix.com', role: 'PROMOTER' },
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  if (sourceType === 'QR_CODE_PDV') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200">
        <span>📱</span> QR Code
      </span>
    )
  }
  if (sourceType === 'MANUAL_PDV') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
        <span>✍️</span> Frentista
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
      PDV
    </span>
  )
}

function FunnelBadge({ stage }: { stage: FunnelStage }) {
  const cfg: Record<FunnelStage, { label: string; cls: string }> = {
    LEAD_COLETADO:      { label: 'Coletado',   cls: 'bg-gray-100 text-gray-600' },
    IA_EM_ATENDIMENTO:  { label: 'IA Ativa',   cls: 'bg-blue-100 text-blue-700' },
    REUNIAO_AGENDADA:   { label: 'Reunião',    cls: 'bg-yellow-100 text-yellow-700' },
    PROPOSTA_ENVIADA:   { label: 'Proposta',   cls: 'bg-orange-100 text-orange-700' },
    CONVERTIDO:         { label: 'Convertido', cls: 'bg-emerald-100 text-emerald-700' },
    PERDIDO:            { label: 'Perdido',    cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = cfg[stage] ?? { label: stage, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg: Record<LeadStatus, { label: string; cls: string }> = {
    PENDENTE_AUDITORIA:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700' },
    AUDITADO_APROVADO:   { label: 'Aprovado',  cls: 'bg-emerald-100 text-emerald-700' },
    AUDITADO_REJEITADO:  { label: 'Rejeitado', cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// Tiny sparkline (SVG path from daily trend data)
function Sparkline({ data }: { data: DailyPoint[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.total), 1)
  const W = 120, H = 32, pad = 2
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
    const y = H - pad - (d.total / max) * (H - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={W} height={H} className="opacity-70">
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PdvLeadsPage() {
  // ── State ──
  const [stats, setStats]           = useState<Stats>(MOCK_STATS)
  const [leads, setLeads]           = useState<PdvLead[]>(MOCK_LEADS)
  const [pagination, setPagination] = useState<Pagination>({ total: 8, page: 1, limit: 20, pages: 1 })
  const [loading, setLoading]       = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)

  // Filters
  const [sourceFilter, setSourceFilter] = useState<'ALL' | SourceType>('ALL')
  const [pdvFilter, setPdvFilter]       = useState('')
  const [search, setSearch]             = useState('')
  const [months, setMonths]             = useState(1)
  const [page, setPage]                 = useState(1)

  // Lead detail modal
  const [selectedLead, setSelectedLead] = useState<PdvLead | null>(null)

  // ── Fetch (uses mock data as fallback) ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const params = new URLSearchParams({ months: String(months) })
      const res = await fetch(`/api/admin/leads/pdv/stats?${params}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) setStats(json.stats)
      }
    } catch { /* keep mock data */ }
    finally { setStatsLoading(false) }
  }, [months])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (sourceFilter !== 'ALL') params.set('sourceType', sourceFilter)
      if (pdvFilter) params.set('pdvId', pdvFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/leads/pdv?${params}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          setLeads(json.data)
          setPagination(json.pagination)
        }
      }
    } catch { /* keep mock data */ }
    finally { setLoading(false) }
  }, [page, sourceFilter, pdvFilter, search])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchLeads() }, [fetchLeads])

  // ── Filtered leads (client-side on mock data) ──
  const filteredLeads = leads.filter(l => {
    if (sourceFilter !== 'ALL' && l.sourceType !== sourceFilter) return false
    if (pdvFilter && l.pdv?.id !== pdvFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!l.nomeCliente.toLowerCase().includes(q) &&
          !(l.telefone?.includes(q)) &&
          !(l.placa?.toLowerCase().includes(q))) return false
    }
    return true
  })

  // ── Unique PDVs for filter dropdown ──
  const uniquePdvs = Array.from(
    new Map(leads.filter(l => l.pdv).map(l => [l.pdv!.id, l.pdv!])).values()
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl">🏪</span>
            Leads PDV — Rede de Parceiros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Leads capturados por leitura de QR Code ou cadastro manual em postos parceiros
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Período:</span>
          {[
            { v: 1, label: 'Mês atual' },
            { v: 3, label: 'Trimestre' },
            { v: 6, label: '6 meses' },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setMonths(opt.v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                months === opt.v
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          METRIC CARDS ROW
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Card 1: Leads no Mês */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Leads no Mês</p>
              {statsLoading ? (
                <div className="h-8 w-16 bg-slate-100 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-3xl font-bold text-slate-800 mt-1">{stats.totalLeadsMonth}</p>
              )}
              <div className="flex items-center gap-1 mt-1">
                <span className={`text-xs font-semibold ${stats.monthGrowthPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stats.monthGrowthPct >= 0 ? '▲' : '▼'} {Math.abs(stats.monthGrowthPct)}%
                </span>
                <span className="text-xs text-slate-400">vs mês anterior ({stats.totalLeadsPrevMonth})</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-xl">🏪</div>
          </div>
          <div className="mt-3">
            <Sparkline data={stats.dailyTrend} />
          </div>
        </div>

        {/* Card 2: Breakdown por Origem */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Origem dos Leads</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{stats.totalLeadsAllTime}</p>
              <p className="text-xs text-slate-400 mt-0.5">total acumulado</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl">📡</div>
          </div>
          <div className="space-y-2 mt-2">
            {stats.bySource.filter(s => s.sourceType !== 'PDV').map(src => (
              <div key={src.sourceType}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-600">{src.label}</span>
                  <span className="font-semibold text-slate-700">{src.count} <span className="text-slate-400 font-normal">({src.pct}%)</span></span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      src.sourceType === 'QR_CODE_PDV' ? 'bg-violet-500' : 'bg-blue-400'
                    }`}
                    style={{ width: `${src.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Top 3 PDVs Ranking */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Top 3 PDVs (Período)</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{stats.conversionRate}%</p>
              <p className="text-xs text-slate-400 mt-0.5">taxa de conversão geral</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">🏆</div>
          </div>
          <div className="space-y-2">
            {stats.topPdvs.map(pdv => (
              <div key={pdv.pdvId} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  pdv.rank === 1 ? 'bg-amber-400 text-white' :
                  pdv.rank === 2 ? 'bg-slate-300 text-slate-700' :
                  'bg-orange-200 text-orange-700'
                }`}>{pdv.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{pdv.pdvName}</p>
                  <p className="text-xs text-slate-400">{pdv.cidade}/{pdv.uf} · {pdv.leadsCount} leads</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 shrink-0">{pdv.convRate}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FILTERS BAR
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por nome, telefone ou placa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
          </div>

          {/* Source type filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {[
              { v: 'ALL',          label: 'Todos' },
              { v: 'QR_CODE_PDV',  label: '📱 QR Code' },
              { v: 'MANUAL_PDV',   label: '✍️ Frentista' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => { setSourceFilter(opt.v as typeof sourceFilter); setPage(1) }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sourceFilter === opt.v
                    ? 'bg-white text-violet-700 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* PDV filter */}
          <select
            value={pdvFilter}
            onChange={e => { setPdvFilter(e.target.value); setPage(1) }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">Todos os PDVs</option>
            {uniquePdvs.map(pdv => (
              <option key={pdv.id} value={pdv.id}>{pdv.name}</option>
            ))}
          </select>

          {/* Reset */}
          {(search || sourceFilter !== 'ALL' || pdvFilter) && (
            <button
              onClick={() => { setSearch(''); setSourceFilter('ALL'); setPdvFilter(''); setPage(1) }}
              className="text-xs text-slate-500 hover:text-red-500 underline"
            >
              Limpar filtros
            </button>
          )}

          <div className="ml-auto text-xs text-slate-400">
            {filteredLeads.length} registro{filteredLeads.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LEADS TABLE
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Data/Hora</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">PDV Parceiro</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[80px]">Tipo Lead</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Promotor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">Origem</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Funil</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[95px]">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[60px]">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="text-4xl">🔍</span>
                      <p className="font-medium">Nenhum lead encontrado</p>
                      <p className="text-xs">Tente ajustar os filtros</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">

                    {/* Data/Hora */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-700 font-medium">{fmtDate(lead.createdAt)}</div>
                      <div className="text-xs text-slate-400">{fmtRelative(lead.createdAt)}</div>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                          {lead.nomeCliente.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{lead.nomeCliente}</p>
                          <p className="text-xs text-slate-400">{lead.telefone ?? '—'}</p>
                        </div>
                      </div>
                    </td>

                    {/* PDV */}
                    <td className="px-4 py-3">
                      {lead.pdv ? (
                        <div>
                          <p className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{lead.pdv.name}</p>
                          <p className="text-xs text-slate-400">{lead.pdv.cidade}/{lead.pdv.uf}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Tipo Lead */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        lead.leadType === 'B2B'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}>
                        {lead.leadType}
                      </span>
                    </td>

                    {/* Promotor */}
                    <td className="px-4 py-3">
                      {lead.promotor ? (
                        <div>
                          <p className="text-sm font-medium text-slate-700 truncate max-w-[120px]">{lead.promotor.nome}</p>
                          <p className="text-xs text-slate-400 capitalize">{lead.promotor.role.toLowerCase()}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Origem */}
                    <td className="px-4 py-3">
                      <SourceBadge sourceType={lead.sourceType} />
                    </td>

                    {/* Funil */}
                    <td className="px-4 py-3">
                      <FunnelBadge stage={lead.funnelStage} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-500 transition-colors text-sm"
                        title="Ver detalhes"
                      >
                        👁
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Mostrando {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} leads
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:border-violet-300"
              >
                ‹ Anterior
              </button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-7 h-7 text-xs rounded border transition-colors ${
                    page === n
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 hover:border-violet-300 text-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="px-2 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:border-violet-300"
              >
                Próximo ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LEAD DETAIL MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedLead(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-lg font-bold text-violet-700">
                  {selectedLead.nomeCliente.charAt(0)}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{selectedLead.nomeCliente}</h2>
                  <p className="text-xs text-slate-400">{selectedLead.telefone ?? 'Sem telefone'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <SourceBadge sourceType={selectedLead.sourceType} />
                <FunnelBadge stage={selectedLead.funnelStage} />
                <StatusBadge status={selectedLead.status} />
              </div>

              {/* Grid info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Veículo" value={selectedLead.veiculo || '—'} />
                <InfoRow label="Placa" value={selectedLead.placa || '—'} />
                <InfoRow label="Tipo" value={selectedLead.leadType} />
                <InfoRow label="IA Status" value={selectedLead.iaStatus ?? '—'} />
                <InfoRow label="Criado em" value={fmtDate(selectedLead.createdAt)} />
                <InfoRow label="E-mail" value={selectedLead.email ?? '—'} />
              </div>

              {/* PDV Section */}
              {selectedLead.pdv && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-2">🏪 PDV de Origem</p>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow label="Nome" value={selectedLead.pdv.name} />
                    <InfoRow label="Cidade/UF" value={`${selectedLead.pdv.cidade ?? '—'}/${selectedLead.pdv.uf ?? '—'}`} />
                    <InfoRow label="Total Leads" value={String(selectedLead.pdv.totalLeads)} />
                    <InfoRow label="Total Vendas" value={String(selectedLead.pdv.totalSales)} />
                  </div>
                </div>
              )}

              {/* Promotor Section */}
              {selectedLead.promotor && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">👤 Promotor Responsável</p>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow label="Nome" value={selectedLead.promotor.nome} />
                    <InfoRow label="E-mail" value={selectedLead.promotor.email} />
                    <InfoRow label="Perfil" value={selectedLead.promotor.role} />
                  </div>
                </div>
              )}

              {/* QR Code link preview */}
              {selectedLead.sourceType === 'QR_CODE_PDV' && selectedLead.pdv && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🔗 Link QR Code usado</p>
                  <code className="text-xs text-slate-600 break-all">
                    https://wa.me/55XXXXX?text=Olá!%20[Ref:%20PDV-{selectedLead.pdv.id}]
                  </code>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 flex gap-2">
              <a
                href={`/operacao/lead/${selectedLead.id}`}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium text-center hover:bg-violet-700 transition-colors"
              >
                Abrir Lead Completo
              </a>
              <button
                onClick={() => setSelectedLead(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Tiny helper component for key/value rows
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700 truncate" title={value}>{value}</p>
    </div>
  )
}
