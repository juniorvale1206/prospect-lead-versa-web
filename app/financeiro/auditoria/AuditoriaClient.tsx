'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModalAuditoria, Toast, type Lead } from '@/components/auditoria/ModalAuditoria'

/* ─────────── Status Badge ─────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDENTE_AUDITORIA: {
      label: 'Aguardando',
      className: 'bg-amber-100 text-amber-700 border border-amber-200',
    },
    AUDITADO_APROVADO: {
      label: 'Aprovado',
      className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    },
    AUDITADO_REJEITADO: {
      label: 'Rejeitado',
      className: 'bg-red-100 text-red-600 border border-red-200',
    },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'PENDENTE_AUDITORIA' ? 'bg-amber-400 animate-pulse' :
        status === 'AUDITADO_APROVADO'  ? 'bg-emerald-500' : 'bg-red-500'
      }`}/>
      {cfg.label}
    </span>
  )
}

/* ─────────── Skeleton ─────────── */
function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className={`h-4 bg-slate-100 rounded-lg animate-pulse ${i === 0 ? 'w-40' : i === 4 ? 'w-20' : 'w-28'}`}/>
        </td>
      ))}
    </tr>
  )
}

/* ─────────── Card de lead pendente ─────────── */
function LeadCard({ lead, onVerFoto }: { lead: Lead; onVerFoto: () => void }) {
  const [imgError, setImgError] = useState(false)
  const PLACEHOLDER = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=70'

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col group">
      {/* Thumbnail */}
      <div className="relative h-40 bg-slate-100 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgError ? PLACEHOLDER : (lead.platePhotoUrl || PLACEHOLDER)}
          alt={`Foto placa ${lead.placa}`}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* Overlay placa */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
          <span className="text-white font-black text-lg tracking-[0.3em] drop-shadow">
            {lead.placa}
          </span>
        </div>
        {/* Badge tenant */}
        {lead.tenant && (
          <div className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-sm text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {lead.tenant.nome}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div>
          <p className="text-slate-800 font-bold text-sm truncate">{lead.nomeCliente}</p>
          {lead.telefone && <p className="text-slate-400 text-xs">{lead.telefone}</p>}
        </div>

        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="truncate">{lead.veiculo}</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <span className="truncate">{lead.praca}</span>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 mt-auto">
          <span className="text-amber-600 text-xs font-semibold">Placa:</span>
          <span className="text-amber-800 font-black text-sm tracking-widest">{lead.placa}</span>
        </div>

        <button
          onClick={onVerFoto}
          className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-blue-200 hover:shadow-blue-300 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Ver Foto &amp; Auditar
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function AuditoriaClientPage() {
  const [leads,        setLeads]        = useState<Lead[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE_AUDITORIA')
  const [viewMode,     setViewMode]     = useState<'cards' | 'table'>('cards')
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/auditoria?status=${filtroStatus}`, { cache: 'no-store' })
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch {
      setToast({ msg: 'Erro ao carregar leads', tipo: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filtroStatus])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  function handleAuditado(id: string, acao: 'aprovar' | 'rejeitar') {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLead(null)
    if (acao === 'aprovar') {
      setToast({ msg: 'Placa aprovada. Comissão de R$ 2,00 registrada com sucesso.', tipo: 'success' })
    } else {
      setToast({ msg: 'Foto rejeitada. Comissão de R$ 1,00 mantida.', tipo: 'error' })
    }
  }

  /* Stats dos cards de resumo */
  const totalPendente = leads.filter(l => l.status === 'PENDENTE_AUDITORIA').length
  const totalAprovado = leads.filter(l => l.status === 'AUDITADO_APROVADO').length
  const totalRejeitado = leads.filter(l => l.status === 'AUDITADO_REJEITADO').length
  const valorPotencial = leads.filter(l => l.status === 'PENDENTE_AUDITORIA').length * 2

  const filtros = [
    { valor: 'PENDENTE_AUDITORIA', label: 'Aguardando', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-amber-200' },
    { valor: 'AUDITADO_APROVADO',  label: 'Aprovados',  activeClass: 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-200' },
    { valor: 'AUDITADO_REJEITADO', label: 'Rejeitados', activeClass: 'bg-red-500 text-white border-red-500 shadow-red-200' },
  ]

  return (
    <>
      {/* Toast */}
      {toast && (
        <Toast msg={toast.msg} tipo={toast.tipo} onHide={() => setToast(null)} />
      )}

      {/* Modal */}
      <ModalAuditoria
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onAuditado={handleAuditado}
      />

      <div className="space-y-6 max-w-7xl mx-auto">

        {/* ── Topo ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-black text-slate-800">Auditoria de Fotos</h1>
            </div>
            <p className="text-slate-500 text-sm ml-[52px]">
              Confira fotos de placas e defina a comissão: R$ 2,00 (aprovada) ou R$ 1,00 (rejeitada)
            </p>
          </div>
          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-semibold shadow-sm hover:border-slate-300 transition-all self-start"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Atualizar
          </button>
        </div>

        {/* ── Cards de resumo ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Aguardando"
            value={loading ? '—' : String(totalPendente)}
            icon="⏳"
            className="bg-amber-50 border-amber-200"
            valueClass="text-amber-700"
            pulse={totalPendente > 0}
          />
          <SummaryCard
            label="Aprovados"
            value={loading ? '—' : String(totalAprovado)}
            icon="✅"
            className="bg-emerald-50 border-emerald-200"
            valueClass="text-emerald-700"
          />
          <SummaryCard
            label="Rejeitados"
            value={loading ? '—' : String(totalRejeitado)}
            icon="❌"
            className="bg-red-50 border-red-200"
            valueClass="text-red-600"
          />
          <SummaryCard
            label="Potencial pendente"
            value={loading ? '—' : `R$ ${valorPotencial.toFixed(2)}`}
            icon="💰"
            className="bg-blue-50 border-blue-200"
            valueClass="text-blue-700"
            sublabel="se todos aprovados"
          />
        </div>

        {/* ── Controles: filtros + toggle view ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Filtros de status */}
          <div className="flex gap-2 flex-wrap">
            {filtros.map(f => (
              <button
                key={f.valor}
                onClick={() => setFiltroStatus(f.valor)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm ${
                  filtroStatus === f.valor
                    ? `${f.activeClass} shadow-md`
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle cards/tabela */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Tabela
            </button>
          </div>
        </div>

        {/* ── Conteúdo ── */}
        {loading ? (
          viewMode === 'cards' ? (
            /* Skeleton cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="h-40 bg-slate-100 animate-pulse"/>
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4"/>
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2"/>
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-2/3"/>
                    <div className="h-9 bg-slate-100 rounded-xl animate-pulse mt-3"/>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Cliente', 'Veículo', 'Placa', 'Praça', 'Status', 'Ação'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...Array(4)].map((_, i) => <SkeletonRow key={i}/>)}
                </tbody>
              </table>
            </div>
          )
        ) : leads.length === 0 ? (
          /* Empty state */
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-700 font-bold text-base">Nenhum lead encontrado</p>
            <p className="text-slate-400 text-sm mt-1">
              {filtroStatus === 'PENDENTE_AUDITORIA'
                ? 'Não há fotos aguardando auditoria no momento.'
                : 'Nenhum lead com este status.'}
            </p>
            {filtroStatus !== 'PENDENTE_AUDITORIA' && (
              <button
                onClick={() => setFiltroStatus('PENDENTE_AUDITORIA')}
                className="mt-4 text-blue-600 text-sm font-semibold hover:underline"
              >
                Ver pendentes
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          /* ── VIEW: CARDS ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leads.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onVerFoto={() => setSelectedLead(lead)}
              />
            ))}
          </div>
        ) : (
          /* ── VIEW: TABELA ── */
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Cliente', 'Veículo', 'Placa', 'Praça / Marca', 'Status', 'Ação'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50 transition-colors group"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <td className="px-5 py-4">
                        <div>
                          <p className="text-slate-800 font-semibold text-sm">{lead.nomeCliente}</p>
                          {lead.telefone && <p className="text-slate-400 text-xs mt-0.5">{lead.telefone}</p>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-600 text-sm whitespace-nowrap">{lead.veiculo}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-black text-slate-800 tracking-[0.2em] text-sm bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl whitespace-nowrap">
                          {lead.placa}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700 text-sm font-medium whitespace-nowrap">{lead.praca}</p>
                        {lead.tenant && (
                          <span className="text-[11px] text-slate-400">{lead.tenant.nome}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={lead.status} />
                        {lead.motivoRejeicao && (
                          <p className="text-red-400 text-[11px] mt-1 max-w-[160px] truncate" title={lead.motivoRejeicao}>
                            {lead.motivoRejeicao}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {lead.status === 'PENDENTE_AUDITORIA' ? (
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-blue-200 hover:shadow-blue-300 group-hover:scale-105 active:scale-95"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Ver Foto
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {lead.status === 'AUDITADO_APROVADO' ? (
                              <span className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                R$ 2,00
                              </span>
                            ) : (
                              <span className="text-red-500 text-xs font-bold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                R$ 1,00
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer tabela */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-slate-400 text-xs font-medium">
                {leads.length} registro{leads.length !== 1 ? 's' : ''}
              </p>
              {filtroStatus === 'PENDENTE_AUDITORIA' && leads.length > 0 && (
                <p className="text-amber-600 text-xs font-bold">
                  💰 Potencial: R$ {(leads.length * 2).toFixed(2)} (se todos aprovados)
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ─────────── Summary Card ─────────── */
function SummaryCard({
  label, value, icon, className, valueClass, sublabel, pulse,
}: {
  label: string; value: string; icon: string
  className?: string; valueClass?: string; sublabel?: string; pulse?: boolean
}) {
  return (
    <div className={`border rounded-2xl p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className={`text-2xl font-black ${valueClass}`}>{value}</p>
            {pulse && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75"/>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"/>
              </span>
            )}
          </div>
          {sublabel && <p className="text-slate-400 text-[11px] mt-0.5">{sublabel}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}
