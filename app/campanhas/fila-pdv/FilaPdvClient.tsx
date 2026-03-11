'use client'

/**
 * FilaPdvClient.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fila de Oportunidades PDV — Estoque de Leads por Safra
 *
 * Funcionalidades:
 *   • Filtros: safra, PDV parceiro, tipo de origem, toggle "ocultar contatados"
 *   • Tabela com seleção múltipla (checkbox master + individuais)
 *   • Badge visual de safra com ícone de uva 🍷 + cor por mês
 *   • Temperatura do lead (quente/morno/frio) calculada por dias sem contato
 *   • Barra flutuante de ação que aparece ao selecionar ≥ 1 lead
 *   • Botão "🚀 Enviar para Motor de Campanhas" → redireciona para /campanhas/nova
 *     passando safra e IDs como query params + sessionStorage
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueLead {
  id:               string
  nomeCliente:      string
  telefone:         string | null
  email:            string | null
  veiculo:          string
  placa:            string
  leadType:         string
  sourceType:       string
  cohort:           string | null
  safraLabel:       string | null
  funnelStage:      string
  iaStatus:         string | null
  status:           string
  lastContactedAt:  string | null
  lastCampaignId:   string | null
  daysSinceContact: number | null
  createdAt:        string
  pdv:  { id: string; name: string; cidade: string | null; uf: string | null; storeType: string } | null
  promotor: { id: string; nome: string; email: string } | null
}

interface CohortSummary {
  cohort:      string
  label:       string
  total:       number
  readyToSend: number
  contacted:   number
  converted:   number
  pdvCount:    number
}

interface Session {
  role: string
  nome: string
  tenantId?: string | null
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_SUMMARY: CohortSummary[] = [
  { cohort: '03/2026', label: 'Safra Mar/26', total: 87, readyToSend: 63, contacted: 15, converted: 9,  pdvCount: 4 },
  { cohort: '02/2026', label: 'Safra Fev/26', total: 64, readyToSend: 41, contacted: 18, converted: 5,  pdvCount: 3 },
  { cohort: '01/2026', label: 'Safra Jan/26', total: 52, readyToSend: 28, contacted: 19, converted: 5,  pdvCount: 3 },
  { cohort: '12/2025', label: 'Safra Dez/25', total: 38, readyToSend: 12, contacted: 22, converted: 4,  pdvCount: 2 },
]

const MOCK_PDVS = [
  { id: 'pdv-1', name: 'Posto Ipiranga Centro' },
  { id: 'pdv-2', name: 'Auto Posto BR-040' },
  { id: 'pdv-3', name: 'Posto Shell Savassi' },
  { id: 'pdv-4', name: 'Posto Ale Contagem' },
]

function makeMockLeads(): QueueLead[] {
  const cohorts   = ['03/2026','02/2026','01/2026','12/2025']
  const safras    = ['Safra Mar/26','Safra Fev/26','Safra Jan/26','Safra Dez/25']
  const pdvs      = MOCK_PDVS
  const nomes     = ['Roberto Mendes','Fernanda Souza','Paulo Rodrigues','Juliana Lima',
                     'Marcelo Santos','Tatiana Alves','Diego Martins','Sandra Pereira',
                     'André Costa','Priscila Gomes','Felipe Barbosa','Camila Rocha',
                     'Lucas Oliveira','Mariana Ferreira','Bruno Lima','Carla Mendes',
                     'Gustavo Silva','Amanda Pereira','Rafael Souza','Letícia Costa']
  const veiculos  = ['Honda Civic 2021','Toyota Corolla 2022','Hyundai HB20 2020',
                     'Jeep Compass 2022','Ford Ranger 2021','VW Gol 2019','Fiat Strada 2023']
  const stages    = ['LEAD_COLETADO','IA_EM_ATENDIMENTO','REUNIAO_AGENDADA','PROPOSTA_ENVIADA']

  return Array.from({ length: 80 }, (_, i) => {
    const cohortIdx  = i % 4
    const pdvIdx     = i % 4
    const daysAgo    = i === 0 ? null : Math.floor(Math.random() * 60)
    const lastContacted = daysAgo === null ? null
      : new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    return {
      id:               `lead-${i + 1}`,
      nomeCliente:      nomes[i % nomes.length],
      telefone:         `(31) 9${String(8000 + i).padStart(4,'0')}-${String(1000 + i).padStart(4,'0')}`,
      email:            i % 3 === 0 ? `cliente${i}@email.com` : null,
      veiculo:          veiculos[i % veiculos.length],
      placa:            `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i+3) % 26))}${String.fromCharCode(65 + ((i+7) % 26))}-${String(1000 + i).slice(-4)}`,
      leadType:         i % 8 === 0 ? 'B2B' : 'B2C',
      sourceType:       i % 3 === 0 ? 'MANUAL_PDV' : 'QR_CODE_PDV',
      cohort:           cohorts[cohortIdx],
      safraLabel:       safras[cohortIdx],
      funnelStage:      stages[i % stages.length],
      iaStatus:         i % 4 === 0 ? 'QUALIFICADO' : 'CONTATADO',
      status:           'AUDITADO_APROVADO',
      lastContactedAt:  lastContacted,
      lastCampaignId:   lastContacted ? `camp-${i % 5 + 1}` : null,
      daysSinceContact: daysAgo,
      createdAt:        new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
      pdv: {
        id: pdvs[pdvIdx].id, name: pdvs[pdvIdx].name,
        cidade: 'Belo Horizonte', uf: 'MG', storeType: 'POSTO_COMBUSTIVEL',
      },
      promotor: { id: `pr-${pdvIdx + 1}`, nome: ['Carlos Silva','Ana Ferreira','Marcus Oliveira','Bianca Ramos'][pdvIdx], email: `pr${pdvIdx}@rastremix.com` },
    }
  })
}

const ALL_MOCK_LEADS = makeMockLeads()

// ─── Visual helpers ───────────────────────────────────────────────────────────

/** Cohort badge colors cycle through months */
const COHORT_COLORS: Record<string, string> = {
  '01': 'bg-cyan-100    text-cyan-700    border-cyan-200',
  '02': 'bg-pink-100    text-pink-700    border-pink-200',
  '03': 'bg-violet-100  text-violet-700  border-violet-200',
  '04': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '05': 'bg-amber-100   text-amber-700   border-amber-200',
  '06': 'bg-orange-100  text-orange-700  border-orange-200',
  '07': 'bg-red-100     text-red-700     border-red-200',
  '08': 'bg-indigo-100  text-indigo-700  border-indigo-200',
  '09': 'bg-teal-100    text-teal-700    border-teal-200',
  '10': 'bg-lime-100    text-lime-700    border-lime-200',
  '11': 'bg-purple-100  text-purple-700  border-purple-200',
  '12': 'bg-blue-100    text-blue-700    border-blue-200',
}

function cohortColor(cohort: string | null): string {
  if (!cohort) return 'bg-gray-100 text-gray-500 border-gray-200'
  const mm = cohort.split('/')[0]
  return COHORT_COLORS[mm] ?? 'bg-gray-100 text-gray-500 border-gray-200'
}

/** Temperature: Hot / Warm / Cold based on days since last contact */
function getTemperature(days: number | null): { icon: string; label: string; cls: string } {
  if (days === null) return { icon: '🔥', label: 'Nunca contatado', cls: 'text-orange-500' }
  if (days <= 7)     return { icon: '❄️', label: `Frio (${days}d)`,   cls: 'text-blue-500' }
  if (days <= 30)    return { icon: '🌡️', label: `Morno (${days}d)`,  cls: 'text-yellow-600' }
  return              { icon: '🔥', label: `Quente (${days}d)`,        cls: 'text-red-500' }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SafraBadge({ cohort, label }: { cohort: string | null; label: string | null }) {
  const cls = cohortColor(cohort)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      🍷 {label ?? cohort ?? '—'}
    </span>
  )
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  if (sourceType === 'QR_CODE_PDV') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-600">📱 QR</span>
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">✍️ Manual</span>
}

function FunnelBadge({ stage }: { stage: string }) {
  const cfg: Record<string, string> = {
    LEAD_COLETADO:     'bg-gray-100 text-gray-500',
    IA_EM_ATENDIMENTO: 'bg-blue-100 text-blue-600',
    REUNIAO_AGENDADA:  'bg-yellow-100 text-yellow-700',
    PROPOSTA_ENVIADA:  'bg-orange-100 text-orange-700',
    CONVERTIDO:        'bg-emerald-100 text-emerald-700',
  }
  const labels: Record<string, string> = {
    LEAD_COLETADO:     'Coletado',
    IA_EM_ATENDIMENTO: 'IA Ativa',
    REUNIAO_AGENDADA:  'Reunião',
    PROPOSTA_ENVIADA:  'Proposta',
    CONVERTIDO:        'Convertido',
  }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${cfg[stage] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[stage] ?? stage}
    </span>
  )
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SafraSummaryCard({
  summary, selected, onClick,
}: {
  summary: CohortSummary
  selected: boolean
  onClick: () => void
}) {
  const pctReady = summary.total > 0
    ? Math.round((summary.readyToSend / summary.total) * 100)
    : 0
  const cls = cohortColor(summary.cohort)

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition-all w-full ${
        selected
          ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
          : 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
          🍷 {summary.label}
        </span>
        {selected && (
          <span className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
            </svg>
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-800">{summary.total}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Prontos</p>
          <p className="text-lg font-bold text-emerald-600">{summary.readyToSend}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Convertidos</p>
          <p className="text-lg font-bold text-violet-600">{summary.converted}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Prontos para envio</span>
          <span className="font-semibold text-slate-600">{pctReady}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${pctReady}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">{summary.pdvCount} PDV{summary.pdvCount !== 1 ? 's' : ''} de origem</p>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FilaPdvClient({ session }: { session: Session }) {
  const router = useRouter()

  // ── Data state ──
  const [summary, setSummary]     = useState<CohortSummary[]>(MOCK_SUMMARY)
  const [leads, setLeads]         = useState<QueueLead[]>(ALL_MOCK_LEADS)
  const [loading, setLoading]     = useState(false)

  // ── Filters ──
  const [cohortFilter, setCohortFilter]     = useState<string>('ALL')
  const [pdvFilter, setPdvFilter]           = useState<string>('')
  const [sourceFilter, setSourceFilter]     = useState<string>('ALL')
  const [hideCooled, setHideCooled]         = useState(false)
  const [cooldownDays, setCooldownDays]     = useState(15)
  const [searchText, setSearchText]         = useState('')

  // ── Selection ──
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set())
  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null)

  // ── UI ──
  const [showCooldownPicker, setShowCooldownPicker] = useState(false)

  // ── Fetch from API (falls back to mock) ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (cohortFilter !== 'ALL') params.set('cohort', cohortFilter)
      if (pdvFilter)              params.set('pdvId', pdvFilter)
      if (hideCooled)             params.set('cooldownDays', String(cooldownDays))
      const res = await fetch(`/api/admin/leads/queue?${params}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          if (json.data?.length)    setLeads(json.data)
          if (json.summary?.length) setSummary(json.summary)
        }
      }
    } catch { /* keep mock */ }
    finally { setLoading(false) }
  }, [cohortFilter, pdvFilter, hideCooled, cooldownDays])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Clear selection when filters change ──
  useEffect(() => { setSelectedIds(new Set()) }, [cohortFilter, pdvFilter, sourceFilter, hideCooled])

  // ── Filtered leads (client-side on data) ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (cohortFilter !== 'ALL' && l.cohort !== cohortFilter) return false
      if (pdvFilter && l.pdv?.id !== pdvFilter)                 return false
      if (sourceFilter !== 'ALL' && l.sourceType !== sourceFilter) return false
      if (hideCooled && l.daysSinceContact !== null && l.daysSinceContact < cooldownDays) return false
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!l.nomeCliente.toLowerCase().includes(q) &&
            !(l.telefone?.includes(q)) &&
            !(l.placa?.toLowerCase().includes(q)) &&
            !(l.pdv?.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [leads, cohortFilter, pdvFilter, sourceFilter, hideCooled, cooldownDays, searchText])

  // ── Master checkbox state ──
  const allVisibleIds       = filteredLeads.map(l => l.id)
  const allSelected         = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id))
  const someSelected        = allVisibleIds.some(id => selectedIds.has(id)) && !allSelected

  // Currently selected cohort(s) of selected leads
  const selectedLeads       = filteredLeads.filter(l => selectedIds.has(l.id))
  const selectedCohorts     = [...new Set(selectedLeads.map(l => l.cohort).filter(Boolean))]
  const primaryCohort       = selectedCohorts[0] ?? null
  const primarySafraLabel   = summary.find(s => s.cohort === primaryCohort)?.label ?? primaryCohort

  // ── Selection handlers ──
  function toggleMaster() {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  function toggleLead(id: string, idx: number, shiftKey: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)

      // Shift+click: range selection
      if (shiftKey && lastCheckedIdx !== null) {
        const lo  = Math.min(lastCheckedIdx, idx)
        const hi  = Math.max(lastCheckedIdx, idx)
        const ids = filteredLeads.slice(lo, hi + 1).map(l => l.id)
        const addMode = !prev.has(id)
        ids.forEach(lid => addMode ? next.add(lid) : next.delete(lid))
      } else {
        if (next.has(id)) next.delete(id)
        else              next.add(id)
      }
      return next
    })
    setLastCheckedIdx(idx)
  }

  function selectAllInCohort(cohort: string) {
    const ids = filteredLeads.filter(l => l.cohort === cohort).map(l => l.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }

  // ── Enviar para Motor de Campanhas ──
  function handleSendToCampaign() {
    if (selectedIds.size === 0) return

    // Persist selection in sessionStorage so /campanhas/nova can read it
    const payload = {
      leadIds:     [...selectedIds],
      cohort:      primaryCohort,
      safraLabel:  primarySafraLabel,
      count:       selectedIds.size,
      source:      'FILA_PDV',
      timestamp:   new Date().toISOString(),
    }
    sessionStorage.setItem('campanhas_target_audience', JSON.stringify(payload))

    // Redirect to campaign creation with query params as hint
    const params = new URLSearchParams({
      fonte:  'FILA_PDV',
      safra:  primaryCohort ?? '',
      total:  String(selectedIds.size),
    })
    router.push(`/campanhas/nova?${params}`)
  }

  // ── Unique PDVs for filter ──
  const uniquePdvs = useMemo(() => {
    return Array.from(new Map(
      leads.filter(l => l.pdv).map(l => [l.pdv!.id, l.pdv!])
    ).values())
  }, [leads])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6 pb-32">

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE HEADER
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span>🍷</span> Fila de Oportunidades PDV
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Selecione leads por Safra e dispare campanhas segmentadas sem repetição
          </p>
        </div>
        <a
          href="/admin/leads/pdv"
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium"
        >
          ← Painel Leads PDV
        </a>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SAFRA CARDS (horizontal scroll)
         ══════════════════════════════════════════════════════════════════════ */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Safras Disponíveis — Clique para filtrar
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summary.map(s => (
            <SafraSummaryCard
              key={s.cohort}
              summary={s}
              selected={cohortFilter === s.cohort}
              onClick={() => setCohortFilter(prev => prev === s.cohort ? 'ALL' : s.cohort)}
            />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FILTER BAR
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Nome, telefone, placa ou PDV..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {/* Safra dropdown */}
          <select
            value={cohortFilter}
            onChange={e => setCohortFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="ALL">Todas as Safras</option>
            {summary.map(s => (
              <option key={s.cohort} value={s.cohort}>{s.label} ({s.readyToSend} prontos)</option>
            ))}
          </select>

          {/* PDV filter */}
          <select
            value={pdvFilter}
            onChange={e => setPdvFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">Todos os PDVs</option>
            {uniquePdvs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Source type toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {[
              { v: 'ALL',         label: 'Todos'      },
              { v: 'QR_CODE_PDV', label: '📱 QR Code' },
              { v: 'MANUAL_PDV',  label: '✍️ Manual'  },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setSourceFilter(opt.v)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sourceFilter === opt.v
                    ? 'bg-white text-violet-700 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Hide cooled toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setHideCooled(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                hideCooled ? 'bg-violet-600' : 'bg-slate-200'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                hideCooled ? 'translate-x-4' : ''
              }`} />
            </div>
            <span className="text-xs text-slate-600">
              Ocultar contatados &lt;
              <button
                onClick={e => { e.preventDefault(); setShowCooldownPicker(v => !v) }}
                className="font-bold text-violet-600 underline mx-0.5"
              >
                {cooldownDays}d
              </button>
            </span>
          </label>

          {/* Cooldown day picker (inline) */}
          {showCooldownPicker && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-violet-700 font-medium">Cooldown:</span>
              {[7, 15, 30, 45, 60].map(d => (
                <button
                  key={d}
                  onClick={() => { setCooldownDays(d); setShowCooldownPicker(false) }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                    cooldownDays === d
                      ? 'bg-violet-600 text-white'
                      : 'text-violet-600 hover:bg-violet-100'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {selectedIds.size > 0 && (
              <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-1 rounded-lg border border-violet-200">
                {selectedIds.size} selecionados
              </span>
            )}
            <span className="text-xs text-slate-400">{filteredLeads.length} leads</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          OPPORTUNITY TABLE
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">

                {/* Master checkbox */}
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleMaster}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </th>

                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[130px]">
                  <span className="flex items-center gap-1">🍷 Safra</span>
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">PDV Parceiro</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[80px]">Origem</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[90px]">Funil</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[140px]">
                  <span title="Quanto faz que recebeu a última campanha">🌡️ Temperatura</span>
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[110px]">Última Campanha</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="text-5xl">🍷</span>
                      <p className="font-medium text-slate-500">Nenhum lead nesta safra</p>
                      <p className="text-xs">Ajuste os filtros ou aguarde novos leads chegarem</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead, idx) => {
                  const checked = selectedIds.has(lead.id)
                  const temp    = getTemperature(lead.daysSinceContact)
                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors ${
                        checked
                          ? 'bg-violet-50 hover:bg-violet-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => toggleLead(lead.id, idx, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                          onClick={e => toggleLead(lead.id, idx, (e as React.MouseEvent).shiftKey)}
                          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                        />
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                            {lead.nomeCliente.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate max-w-[140px]">{lead.nomeCliente}</p>
                            <p className="text-xs text-slate-400">{lead.telefone ?? '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Safra badge */}
                      <td className="px-3 py-3">
                        <SafraBadge cohort={lead.cohort} label={lead.safraLabel} />
                      </td>

                      {/* PDV */}
                      <td className="px-3 py-3">
                        {lead.pdv ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{lead.pdv.name}</p>
                            <p className="text-xs text-slate-400">{lead.pdv.cidade}/{lead.pdv.uf}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Origem */}
                      <td className="px-3 py-3">
                        <SourceBadge sourceType={lead.sourceType} />
                      </td>

                      {/* Funil */}
                      <td className="px-3 py-3">
                        <FunnelBadge stage={lead.funnelStage} />
                      </td>

                      {/* Temperatura */}
                      <td className="px-3 py-3">
                        <span className={`text-sm flex items-center gap-1 ${temp.cls}`} title={temp.label}>
                          <span>{temp.icon}</span>
                          <span className="text-xs">{temp.label}</span>
                        </span>
                      </td>

                      {/* Última campanha */}
                      <td className="px-3 py-3">
                        {lead.lastCampaignId ? (
                          <div>
                            <p className="text-xs text-slate-600 font-mono truncate max-w-[100px]" title={lead.lastCampaignId}>
                              {lead.lastCampaignId.slice(-8)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {lead.lastContactedAt ? fmtDate(lead.lastContactedAt) : '—'}
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-600 font-medium">
                            ✨ Nunca enviado
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Quick "select all in cohort" shortcut row */}
        {cohortFilter !== 'ALL' && filteredLeads.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-violet-50 flex items-center gap-3">
            <span className="text-xs text-violet-700">
              💡 <strong>{filteredLeads.length} leads</strong> na {summary.find(s => s.cohort === cohortFilter)?.label}
            </span>
            <button
              onClick={() => selectAllInCohort(cohortFilter)}
              className="text-xs text-violet-600 underline hover:text-violet-800"
            >
              Selecionar todos desta safra
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FLOATING ACTION BAR
          Appears only when ≥ 1 lead is selected
         ══════════════════════════════════════════════════════════════════════ */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
          selectedIds.size > 0
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-screen-2xl mx-auto px-6 pb-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

              {/* Info section */}
              <div className="flex items-center gap-4">
                {/* Count badge */}
                <div className="w-14 h-14 rounded-xl bg-violet-600 flex flex-col items-center justify-center shrink-0">
                  <span className="text-white font-black text-xl leading-none">{selectedIds.size}</span>
                  <span className="text-violet-200 text-xs leading-none">leads</span>
                </div>

                <div>
                  <p className="text-white font-semibold text-sm">
                    {selectedIds.size} Lead{selectedIds.size !== 1 ? 's' : ''} Selecionado{selectedIds.size !== 1 ? 's'  : ''}
                    {primarySafraLabel && (
                      <span className="ml-2 text-violet-300">· {primarySafraLabel}</span>
                    )}
                    {selectedCohorts.length > 1 && (
                      <span className="ml-2 text-amber-400 text-xs">({selectedCohorts.length} safras)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-slate-400 text-xs">
                      {[...new Set(selectedLeads.map(l => l.pdv?.id).filter(Boolean))].length} PDVs · {' '}
                      {selectedLeads.filter(l => l.lastCampaignId === null).length} nunca contatados
                    </p>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-slate-400 hover:text-slate-200 text-xs underline transition-colors"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 w-full sm:w-auto">

                {/* Preview breakdown */}
                <div className="hidden md:flex items-center gap-2">
                  {selectedCohorts.slice(0, 3).map(c => (
                    <span
                      key={c}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${cohortColor(c)}`}
                    >
                      🍷 {summary.find(s => s.cohort === c)?.label ?? c}
                    </span>
                  ))}
                </div>

                {/* MAIN CTA */}
                <button
                  onClick={handleSendToCampaign}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2
                             px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500
                             text-white font-bold text-sm shadow-lg shadow-violet-900/50
                             transition-all duration-150 active:scale-95 whitespace-nowrap"
                >
                  <span className="text-lg">🚀</span>
                  Enviar para Motor de Campanhas
                </button>
              </div>
            </div>

            {/* Progress hint bar */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (selectedIds.size / Math.max(1, filteredLeads.length)) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {Math.round((selectedIds.size / Math.max(1, filteredLeads.length)) * 100)}% da fila selecionada
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
