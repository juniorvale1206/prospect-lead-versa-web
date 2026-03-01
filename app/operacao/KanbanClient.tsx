'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type LeadType   = 'B2C' | 'B2B'
type FunnelStage = 'LEAD_COLETADO' | 'IA_EM_ATENDIMENTO' | 'REUNIAO_AGENDADA' | 'CONVERTIDO'

interface Lead {
  id:                string
  leadType:          LeadType
  nomeCliente:       string
  telefone:          string | null
  email:             string | null
  placa:             string
  veiculo:           string
  praca:             string
  cnpj:              string | null
  empresaNome:       string | null
  frota:             string | null
  segmento:          string | null
  doresIdentificadas:string | null
  funnelStage:       FunnelStage
  status:            string
  commissionValue:   number
  createdAt:         string
  tenant:            { id: string; nome: string } | null
  promotor:          { id: string; nome: string; email: string } | null
}

type Grouped = Record<FunnelStage, Lead[]>

interface Tenant { id: string; nome: string }

// ─────────────────────────────────────────────────────────────────────────────
// STAGE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const STAGES: {
  key:        FunnelStage
  label:      string
  sublabel:   string
  icon:       string
  color:      string
  headerBg:   string
  dot:        string
  cardBorder: string
  tagBg:      string
  tagText:    string
}[] = [
  {
    key:        'LEAD_COLETADO',
    label:      'Lead Coletado',
    sublabel:   'Novo — aguardando triagem',
    icon:       '📥',
    color:      'bg-slate-50 border-slate-200',
    headerBg:   'bg-slate-100 border-b border-slate-200',
    dot:        'bg-slate-400',
    cardBorder: 'border-slate-200 hover:border-slate-300',
    tagBg:      'bg-slate-100',
    tagText:    'text-slate-600',
  },
  {
    key:        'IA_EM_ATENDIMENTO',
    label:      'IA em Atendimento',
    sublabel:   'PayMeZap acionado',
    icon:       '🤖',
    color:      'bg-blue-50/60 border-blue-200',
    headerBg:   'bg-blue-100/70 border-b border-blue-200',
    dot:        'bg-blue-500',
    cardBorder: 'border-blue-200 hover:border-blue-300',
    tagBg:      'bg-blue-100',
    tagText:    'text-blue-700',
  },
  {
    key:        'REUNIAO_AGENDADA',
    label:      'Reunião Agendada',
    sublabel:   'Respondido / Aguarda visita',
    icon:       '📅',
    color:      'bg-amber-50/60 border-amber-200',
    headerBg:   'bg-amber-100/70 border-b border-amber-200',
    dot:        'bg-amber-500',
    cardBorder: 'border-amber-200 hover:border-amber-300',
    tagBg:      'bg-amber-100',
    tagText:    'text-amber-700',
  },
  {
    key:        'CONVERTIDO',
    label:      'Convertido',
    sublabel:   'Venda Fechada ✅',
    icon:       '🏆',
    color:      'bg-emerald-50/60 border-emerald-200',
    headerBg:   'bg-emerald-100/70 border-b border-emerald-200',
    dot:        'bg-emerald-500',
    cardBorder: 'border-emerald-200 hover:border-emerald-300',
    tagBg:      'bg-emerald-100',
    tagText:    'text-emerald-700',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmtPhone(p: string | null) {
  if (!p) return '—'
  return p
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ msg, tipo, onHide }: { msg: string; tipo: 'success' | 'error' | 'info'; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 3500)
    return () => clearTimeout(t)
  }, [onHide])

  const colors = {
    success: 'border-emerald-200 shadow-emerald-100',
    error:   'border-red-200 shadow-red-100',
    info:    'border-blue-200 shadow-blue-100',
  }
  const icons = {
    success: <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>,
    error:   <svg className="w-5 h-5 text-red-500"     fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>,
    info:    <svg className="w-5 h-5 text-blue-500"    fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  }
  const iconBg = { success: 'bg-emerald-100', error: 'bg-red-100', info: 'bg-blue-100' }

  return (
    <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border bg-white max-w-sm ${colors[tipo]}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg[tipo]}`}>
        {icons[tipo]}
      </div>
      <p className="text-slate-700 text-sm font-medium flex-1">{msg}</p>
      <button onClick={onHide} className="text-slate-300 hover:text-slate-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHES DO LEAD
// ─────────────────────────────────────────────────────────────────────────────
function ModalLead({ lead, onClose, onMove }: {
  lead: Lead
  onClose: () => void
  onMove: (stage: FunnelStage) => void
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const currentIdx = STAGES.findIndex(s => s.key === lead.funnelStage)
  const stage      = STAGES[currentIdx]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[560px] max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 flex-shrink-0 ${stage.headerBg}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{stage.icon}</span>
            <div>
              <p className="font-bold text-slate-800 text-base leading-tight">{lead.nomeCliente}</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${stage.tagBg} ${stage.tagText}`}>
                {stage.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/70 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Badge tipo */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              lead.leadType === 'B2C'
                ? 'bg-purple-100 text-purple-700 border-purple-200'
                : 'bg-indigo-100 text-indigo-700 border-indigo-200'
            }`}>
              {lead.leadType === 'B2C' ? '🚗 B2C — Pessoa Física' : '🏭 B2B — Empresa'}
            </span>
            <span className="text-slate-400 text-xs">Capturado em {fmtDate(lead.createdAt)}</span>
          </div>

          {/* Grid info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoBox label="📱 Telefone"    value={lead.telefone}   />
            <InfoBox label="📧 E-mail"      value={lead.email}      />

            {lead.leadType === 'B2C' ? (
              <>
                <InfoBox label="🚗 Veículo"    value={lead.veiculo}   />
                <InfoBox label="🔤 Placa"      value={lead.placa} bold />
                <InfoBox label="📍 Praça"      value={lead.praca}     />
                <InfoBox label="🏢 Franquia"   value={lead.tenant?.nome} />
              </>
            ) : (
              <>
                <InfoBox label="🏭 Empresa"    value={lead.empresaNome} />
                <InfoBox label="📋 CNPJ"       value={lead.cnpj}        />
                <InfoBox label="🚛 Frota"      value={lead.frota}       />
                <InfoBox label="⚙️ Segmento"   value={lead.segmento}    />
                <InfoBox label="📍 Localização" value={lead.praca}      />
                <InfoBox label="🏢 Franquia"   value={lead.tenant?.nome} />
              </>
            )}
          </div>

          {/* Dores */}
          {lead.doresIdentificadas && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-700 text-xs font-bold uppercase tracking-wider mb-1.5">💡 Dores Identificadas</p>
              <p className="text-amber-900 text-sm leading-relaxed">{lead.doresIdentificadas}</p>
            </div>
          )}

          {/* Promotor */}
          {lead.promotor && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{initials(lead.promotor.nome)}</span>
              </div>
              <div>
                <p className="text-slate-700 text-sm font-bold">{lead.promotor.nome}</p>
                <p className="text-slate-400 text-xs">{lead.promotor.email}</p>
              </div>
              <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Promotor</span>
            </div>
          )}

          {/* Mover para estágio */}
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Mover para estágio:</p>
            <div className="grid grid-cols-2 gap-2">
              {STAGES.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => { if (s.key !== lead.funnelStage) onMove(s.key) }}
                  disabled={s.key === lead.funnelStage}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all
                    ${s.key === lead.funnelStage
                      ? `${s.tagBg} ${s.tagText} border-current cursor-default opacity-80`
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 active:scale-95'
                    }`}
                >
                  <span>{s.icon}</span>
                  <span className="text-xs leading-tight">{s.label}</span>
                  {s.key === lead.funnelStage && (
                    <svg className="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                  {i < currentIdx && s.key !== lead.funnelStage && (
                    <svg className="w-3 h-3 ml-auto text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                    </svg>
                  )}
                  {i > currentIdx && (
                    <svg className="w-3 h-3 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoBox({ label, value, bold }: { label: string; value: string | null | undefined; bold?: boolean }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-slate-800 text-sm truncate ${bold ? 'font-black tracking-widest' : 'font-medium'}`}>
        {value || <span className="text-slate-300 font-normal text-xs">—</span>}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL EXPORTAR
// ─────────────────────────────────────────────────────────────────────────────
function ModalExport({
  tenants, isAdmin, onClose,
}: {
  tenants: Tenant[]
  isAdmin: boolean
  onClose: () => void
}) {
  const [selectedTenant, setSelectedTenant] = useState('')
  const [leadType,       setLeadType]       = useState('all')
  const [funnelStage,    setFunnelStage]    = useState('all')
  const [loading,        setLoading]        = useState(false)

  async function handleExport() {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedTenant) params.set('tenantId', selectedTenant)
    if (leadType   !== 'all') params.set('leadType',    leadType)
    if (funnelStage !== 'all') params.set('funnelStage', funnelStage)

    const url = `/api/export/leads?${params.toString()}`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Erro na exportação')
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = `ProspecLead_Leads_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      onClose()
    } catch {
      alert('Erro ao exportar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Exportar para Excel (.xlsx)</h2>
              <p className="text-slate-400 text-xs mt-0.5">Planilha organizada com 3 abas e estilos</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Info de segurança */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex gap-2.5">
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <p className="text-blue-700 text-xs">
              {isAdmin
                ? 'Como Admin Master, você pode exportar dados de todas as franquias.'
                : 'Você visualiza apenas os dados da sua franquia (proteção multi-tenant).'}
            </p>
          </div>

          {/* Franquia (só admin) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Franquia</label>
              <select
                value={selectedTenant}
                onChange={e => setSelectedTenant(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">🌐 Todas as franquias</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>🏢 {t.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tipo de lead */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Tipo de Lead</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'all', l: '🌐 Todos' },
                { v: 'B2C', l: '🚗 B2C'  },
                { v: 'B2B', l: '🏭 B2B'  },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLeadType(v)}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    leadType === v
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Estágio do funil */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Estágio do Funil</label>
            <select
              value={funnelStage}
              onChange={e => setFunnelStage(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">Todos os estágios</option>
              {STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
              ))}
            </select>
          </div>

          {/* Colunas exportadas */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">📊 Estrutura do arquivo Excel</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <div>
                  <p className="text-xs font-bold text-slate-700">Aba 1 — Leads</p>
                  <p className="text-[11px] text-slate-500">26 colunas · cabeçalhos coloridos por grupo · zebra · total</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <div>
                  <p className="text-xs font-bold text-slate-700">Aba 2 — Sumário Executivo</p>
                  <p className="text-[11px] text-slate-500">Totais, funil, auditoria e comissões consolidadas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">💰</span>
                <div>
                  <p className="text-xs font-bold text-slate-700">Aba 3 — Comissões por Promotor</p>
                  <p className="text-[11px] text-slate-500">Ranking de promotores com total de comissão</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl
              transition-all shadow-md shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            )}
            {loading ? 'Gerando Excel…' : '⬇ Baixar Excel (.xlsx)'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN CARD
// ─────────────────────────────────────────────────────────────────────────────
function KanbanCard({ lead, stageConfig, onClick }: {
  lead:        Lead
  stageConfig: typeof STAGES[number]
  onClick:     () => void
}) {
  const isB2B = lead.leadType === 'B2B'

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-2xl p-4 shadow-sm cursor-pointer
        hover:shadow-md transition-all duration-200 active:scale-[0.98]
        ${stageConfig.cardBorder}`}
    >
      {/* Topo: tipo + data */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
          isB2B
            ? 'bg-indigo-100 text-indigo-600 border-indigo-200'
            : 'bg-purple-100 text-purple-600 border-purple-200'
        }`}>
          {isB2B ? '🏭 B2B' : '🚗 B2C'}
        </span>
        <span className="text-slate-400 text-[11px]">{fmtDate(lead.createdAt)}</span>
      </div>

      {/* Nome */}
      <p className="text-slate-800 font-bold text-sm truncate leading-tight mb-0.5">
        {lead.nomeCliente}
      </p>

      {/* Empresa (B2B) ou Veículo (B2C) */}
      <p className="text-slate-500 text-xs truncate mb-2.5">
        {isB2B
          ? lead.empresaNome ?? lead.segmento ?? '—'
          : lead.veiculo || '—'}
      </p>

      {/* Placa / Frota / CNPJ */}
      {!isB2B && lead.placa && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black px-2.5 py-0.5 rounded-lg tracking-wider">
            {lead.placa}
          </span>
        </div>
      )}
      {isB2B && lead.frota && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-lg">
            🚛 {lead.frota}
          </span>
        </div>
      )}

      {/* Divisor */}
      <div className="border-t border-slate-100 pt-2.5 mt-auto">
        <div className="flex items-center justify-between">
          {/* Telefone */}
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            <span className="truncate max-w-[90px]">{fmtPhone(lead.telefone)}</span>
          </div>

          {/* Promotor avatar */}
          {lead.promotor ? (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-bold">{initials(lead.promotor.nome)}</span>
              </div>
              <span className="text-slate-500 text-[11px] truncate max-w-[70px]">{lead.promotor.nome.split(' ')[0]}</span>
            </div>
          ) : (
            <span className="text-slate-300 text-[11px]">Sem promotor</span>
          )}
        </div>
      </div>

      {/* Tenant badge (se admin) */}
      {lead.tenant && (
        <div className="mt-2">
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
            {lead.tenant.nome}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON CARD
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-2.5 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-12 bg-slate-100 rounded-full"/>
        <div className="h-4 w-10 bg-slate-100 rounded-full"/>
      </div>
      <div className="h-4 w-3/4 bg-slate-100 rounded-lg"/>
      <div className="h-3 w-1/2 bg-slate-100 rounded-lg"/>
      <div className="h-5 w-20 bg-slate-100 rounded-lg"/>
      <div className="border-t border-slate-100 pt-2.5 flex justify-between">
        <div className="h-3 w-20 bg-slate-100 rounded"/>
        <div className="h-5 w-5 bg-slate-100 rounded-full"/>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN COLUMN
// ─────────────────────────────────────────────────────────────────────────────
function KanbanColumn({ stageConfig, leads, loading, onCardClick }: {
  stageConfig: typeof STAGES[number]
  leads:       Lead[]
  loading:     boolean
  onCardClick: (lead: Lead) => void
}) {
  return (
    <div className={`flex flex-col rounded-2xl border ${stageConfig.color} min-w-[270px] max-w-[270px] flex-shrink-0 h-full`}>
      {/* Cabeçalho da coluna */}
      <div className={`px-4 py-3.5 flex-shrink-0 rounded-t-2xl ${stageConfig.headerBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{stageConfig.icon}</span>
            <div>
              <p className="text-slate-800 font-bold text-sm leading-tight">{stageConfig.label}</p>
              <p className="text-slate-500 text-[11px]">{stageConfig.sublabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${stageConfig.dot}`}/>
            <span className="bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full min-w-[28px] text-center">
              {loading ? '…' : leads.length}
            </span>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {loading ? (
          [...Array(2)].map((_, i) => <SkeletonCard key={i}/>)
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl opacity-30">{stageConfig.icon}</span>
            <p className="text-slate-400 text-xs font-medium">Nenhum lead neste estágio</p>
          </div>
        ) : (
          leads.map(lead => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              stageConfig={stageConfig}
              onClick={() => onCardClick(lead)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
interface KanbanClientProps {
  userRole:     string
  userTenantId: string | null
  userName:     string
}

export default function KanbanClient({ userRole, userTenantId, userName }: KanbanClientProps) {
  const isAdmin   = userRole === 'ADMIN_MASTER'
  const isManager = userRole === 'MANAGER'

  const [leadType,    setLeadType]    = useState<LeadType>('B2C')
  const [grouped,     setGrouped]     = useState<Grouped>({
    LEAD_COLETADO: [], IA_EM_ATENDIMENTO: [], REUNIAO_AGENDADA: [], CONVERTIDO: [],
  })
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [tenants,     setTenants]     = useState<Tenant[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showExport,  setShowExport]  = useState(false)
  const [toast,       setToast]       = useState<{ msg: string; tipo: 'success' | 'error' | 'info' } | null>(null)
  const [moving,      setMoving]      = useState(false)

  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Fetch leads ────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ leadType })
      if (search.trim())          params.set('search',   search.trim())
      if (isAdmin && tenantFilter) params.set('tenantId', tenantFilter)

      const res  = await fetch(`/api/kanban/leads?${params}`, { cache: 'no-store' })
      const data = await res.json()
      setGrouped(data.grouped)
      setTotal(data.total ?? 0)

      // Extrair tenants para o filtro do admin
      if (isAdmin) {
        const map = new Map<string, Tenant>()
        for (const stage of Object.values(data.grouped as Grouped)) {
          for (const l of stage) {
            if (l.tenant) map.set(l.tenant.id, l.tenant)
          }
        }
        setTenants(t => {
          const merged = new Map(t.map(x => [x.id, x]))
          map.forEach((v, k) => merged.set(k, v))
          return Array.from(merged.values())
        })
      }
    } catch {
      setToast({ msg: 'Erro ao carregar leads', tipo: 'error' })
    } finally {
      setLoading(false)
    }
  }, [leadType, search, tenantFilter, isAdmin])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Busca com debounce
  function handleSearchChange(v: string) {
    setSearch(v)
    clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => fetchLeads(), 500)
  }

  // ── Mover card ─────────────────────────────────────────────────────────────
  async function handleMove(leadId: string, newStage: FunnelStage) {
    setMoving(true)
    const oldStage = Object.entries(grouped).find(([, ls]) => ls.find(l => l.id === leadId))?.[0] as FunnelStage | undefined
    if (!oldStage) return

    // Atualiza UI otimisticamente
    const lead = grouped[oldStage].find(l => l.id === leadId)!
    setGrouped(g => ({
      ...g,
      [oldStage]:  g[oldStage].filter(l => l.id !== leadId),
      [newStage]:  [{ ...lead, funnelStage: newStage }, ...g[newStage]],
    }))
    setSelectedLead(l => l ? { ...l, funnelStage: newStage } : null)

    try {
      const res  = await fetch('/api/kanban/move', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadId, funnelStage: newStage }),
      })
      if (!res.ok) throw new Error()
      const stageCfg = STAGES.find(s => s.key === newStage)!
      setToast({ msg: `Lead movido para "${stageCfg.label}"`, tipo: 'success' })
    } catch {
      // Rollback
      fetchLeads()
      setToast({ msg: 'Erro ao mover lead. Revertendo…', tipo: 'error' })
    } finally {
      setMoving(false)
    }
  }

  // ── Stats totais ────────────────────────────────────────────────────────────
  const statsConvertido = grouped.CONVERTIDO.length
  const statsPendentes  = grouped.LEAD_COLETADO.length + grouped.IA_EM_ATENDIMENTO.length

  return (
    <>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onHide={() => setToast(null)}/>}

      {selectedLead && (
        <ModalLead
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onMove={(stage) => handleMove(selectedLead.id, stage)}
        />
      )}

      {showExport && (
        <ModalExport
          tenants={tenants}
          isAdmin={isAdmin}
          onClose={() => setShowExport(false)}
        />
      )}

      <div className="h-full flex flex-col gap-5">

        {/* ── Topo ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">Operação — Kanban</h1>
                <p className="text-slate-500 text-sm">
                  {isAdmin ? 'Visão global de todos os tenants' : `Franquia: ${userName.split(' ')[0]}`}
                </p>
              </div>
            </div>
          </div>

          {/* Botão Exportar */}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600
              text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200 hover:shadow-emerald-300
              transition-all self-start active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Exportar Excel (.xlsx)
          </button>
        </div>

        {/* ── Stats rápidos ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total</p>
              <p className="text-xl font-black text-slate-800">{loading ? '—' : total}</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Em Aberto</p>
              <p className="text-xl font-black text-amber-700">{loading ? '—' : statsPendentes}</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Convertidos</p>
              <p className="text-xl font-black text-emerald-700">{loading ? '—' : statsConvertido}</p>
            </div>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <span className="text-2xl">{leadType === 'B2C' ? '🚗' : '🏭'}</span>
            <div>
              <p className="text-xs text-violet-600 font-semibold uppercase tracking-wider">Modo atual</p>
              <p className="text-sm font-black text-violet-700">{leadType === 'B2C' ? 'B2C — Físicos' : 'B2B — Frotas'}</p>
            </div>
          </div>
        </div>

        {/* ── Controles ── */}
        <div className="flex flex-wrap items-center gap-3 flex-shrink-0">

          {/* Toggle B2C / B2B */}
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setLeadType('B2C')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                leadType === 'B2C'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🚗 B2C — Veículos
            </button>
            <button
              onClick={() => setLeadType('B2B')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                leadType === 'B2B'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🏭 B2B — Frotas
            </button>
          </div>

          {/* Busca */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder={leadType === 'B2C' ? 'Buscar por nome, placa…' : 'Buscar por empresa, CNPJ…'}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all"
            />
          </div>

          {/* Filtro tenant (admin) */}
          {isAdmin && (
            <select
              value={tenantFilter}
              onChange={e => setTenantFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">🏢 Todas as franquias</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          )}

          {/* Refresh */}
          <button
            onClick={fetchLeads}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
            title="Atualizar"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>

          {moving && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Movendo…
            </div>
          )}
        </div>

        {/* ── Kanban Board ── */}
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="flex gap-4 h-full min-w-max">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.key}
                stageConfig={stage}
                leads={grouped[stage.key] ?? []}
                loading={loading}
                onCardClick={setSelectedLead}
              />
            ))}
          </div>
        </div>

        {/* Dica de uso */}
        <p className="text-center text-slate-400 text-xs flex-shrink-0">
          💡 Clique em qualquer card para ver detalhes e mover entre os estágios do funil
        </p>
      </div>
    </>
  )
}
