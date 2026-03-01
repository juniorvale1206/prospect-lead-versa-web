'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModalAuditoria, Toast, type Lead } from '@/components/auditoria/ModalAuditoria'

/* ── Badge de Status ── */
function StatusBadge({ status }: { status: string }) {
  const cfg = {
    PENDENTE_AUDITORIA:  { label: 'Pendente',  bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
    AUDITADO_APROVADO:   { label: 'Aprovado',  bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    AUDITADO_REJEITADO:  { label: 'Rejeitado', bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  }[status] ?? { label: status, bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  )
}

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 bg-slate-100 rounded-lg animate-pulse"/>
        </td>
      ))}
    </tr>
  )
}

/* ── Página Principal ── */
export default function AuditoriaClientPage() {
  const [leads,        setLeads]        = useState<Lead[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE_AUDITORIA')
  const [toast,        setToast]        = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/auditoria?status=${filtroStatus}`)
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
    setToast({
      msg: acao === 'aprovar'
        ? '✅ Placa aprovada! Comissão de R$ 2,00 aplicada.'
        : '❌ Foto rejeitada. Comissão de R$ 1,00 mantida.',
      tipo: acao === 'aprovar' ? 'success' : 'error',
    })
  }

  const pendentes  = leads.filter(l => l.status === 'PENDENTE_AUDITORIA').length
  const aprovados  = leads.filter(l => l.status === 'AUDITADO_APROVADO').length
  const rejeitados = leads.filter(l => l.status === 'AUDITADO_REJEITADO').length

  const filtros = [
    { valor: 'PENDENTE_AUDITORIA', label: 'Pendentes',  count: null, color: 'amber'   },
    { valor: 'AUDITADO_APROVADO',  label: 'Aprovados',  count: null, color: 'emerald' },
    { valor: 'AUDITADO_REJEITADO', label: 'Rejeitados', count: null, color: 'red'     },
  ]

  return (
    <div className="space-y-6">
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

      {/* Header da página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Auditoria de Fotos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Confira as fotos de placas e aprove ou rejeite o bônus de R$ 2,00
          </p>
        </div>
        <button onClick={fetchLeads}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all text-sm font-medium shadow-sm self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Aguardando Auditoria', value: pendentes,  color: 'amber',   icon: '⏳', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
          { label: 'Aprovados (R$ 2,00)',  value: aprovados,  color: 'emerald', icon: '✅', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
          { label: 'Rejeitados (R$ 1,00)', value: rejeitados, color: 'red',     icon: '❌', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700'     },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-black mt-1 ${s.text}`}>{loading ? '—' : s.value}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {filtros.map(f => (
          <button key={f.valor} onClick={() => setFiltroStatus(f.valor)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              filtroStatus === f.valor
                ? f.color === 'amber'   ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                : f.color === 'emerald' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                :                         'bg-red-500 text-white border-red-500 shadow-md'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Cliente', 'Veículo', 'Placa', 'Praça', 'Status', 'Ação'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(3)].map((_, i) => <SkeletonRow key={i} />)
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-slate-700 font-semibold text-sm">Nenhum lead encontrado</p>
                        <p className="text-slate-400 text-xs mt-1">Não há leads com este status no momento</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead, idx) => (
                  <tr key={lead.id}
                    className="hover:bg-slate-50 transition-colors group"
                    style={{ animationDelay: `${idx * 60}ms` }}>
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-slate-800 font-semibold text-sm">{lead.nomeCliente}</p>
                        {lead.telefone && <p className="text-slate-400 text-xs mt-0.5">{lead.telefone}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 text-sm">{lead.veiculo}</td>
                    <td className="px-5 py-4">
                      <span className="font-black text-slate-800 tracking-widest text-sm bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                        {lead.placa}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-slate-700 text-sm font-medium">{lead.praca}</p>
                        {lead.tenant && <p className="text-slate-400 text-xs">{lead.tenant.nome}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={lead.status} /></td>
                    <td className="px-5 py-4">
                      {lead.status === 'PENDENTE_AUDITORIA' ? (
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-blue-200 hover:shadow-blue-300 group-hover:scale-105">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Ver Foto
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">
                          {lead.status === 'AUDITADO_APROVADO' ? '✅ Aprovado' : '❌ Rejeitado'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer da tabela */}
        {!loading && leads.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <p className="text-slate-400 text-xs">{leads.length} lead{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}</p>
            {filtroStatus === 'PENDENTE_AUDITORIA' && leads.length > 0 && (
              <p className="text-amber-600 text-xs font-semibold">
                💰 Total pendente: R$ {(leads.length * 2).toFixed(2)} (se todos aprovados)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
