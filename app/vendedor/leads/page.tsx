'use client'

/**
 * /vendedor/leads — Atendimentos registrados pelo vendedor PDV
 */

import { useState, useEffect, useCallback } from 'react'

interface Lead {
  id: string; nomeCliente: string; telefone: string
  veiculo?: string; placa?: string; leadType: string
  funnelStage: string; createdAt: string
  empresaNome?: string; frota?: string
}

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  LEAD_COLETADO:     { label: 'Coletado',    color: 'text-slate-600',   bg: 'bg-slate-100'   },
  IA_EM_ATENDIMENTO: { label: 'IA Ativa',     color: 'text-blue-600',   bg: 'bg-blue-50'     },
  REUNIAO_AGENDADA:  { label: 'Reunião',      color: 'text-amber-700',  bg: 'bg-amber-50'    },
  CONVERTIDO:        { label: 'Convertido',   color: 'text-emerald-700',bg: 'bg-emerald-50'  },
  SALE_CLOSED:       { label: 'Vendido',      color: 'text-purple-700', bg: 'bg-purple-50'   },
  LOST:              { label: 'Perdido',      color: 'text-red-600',    bg: 'bg-red-50'      },
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export default function VendedorLeadsPage() {
  const [leads, setLeads]   = useState<Lead[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]  = useState('')
  const [stage, setStage]    = useState('')
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) p.set('search', search)
      if (stage)  p.set('funnelStage', stage)
      const res  = await fetch(`/api/vendedor/leads?${p}`)
      const data = await res.json()
      setLeads(data.leads ?? [])
      setTotal(data.total ?? 0)
    } finally { setLoading(false) }
  }, [page, search, stage])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, stage])

  const pages = Math.ceil(total / 20)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meus Atendimentos</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} atendimentos registrados</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Novo Atendimento
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div className="flex-1 min-w-[180px] relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nome, telefone ou placa..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"/>
        </div>
        <select value={stage} onChange={e => setStage(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
          <option value="">Todos</option>
          {Object.entries(STAGE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <svg className="w-6 h-6 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Carregando...
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-slate-500 font-medium">Nenhum atendimento encontrado</p>
            <button onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              Registrar atendimento
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {leads.map(l => {
                const s = STAGE_META[l.funnelStage] ?? STAGE_META.LEAD_COLETADO
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${s.bg} ${s.color}`}>
                      {l.nomeCliente.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{l.nomeCliente}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{l.telefone}</span>
                        {l.placa && <span className="text-xs font-mono font-bold text-slate-500">{l.placa}</span>}
                        {l.veiculo && <span className="text-xs text-slate-400 truncate">{l.veiculo}</span>}
                        {l.empresaNome && <span className="text-xs text-slate-500 truncate">{l.empresaNome}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(l.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Página {page} de {pages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <button onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <NovoAtendimentoInline onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}

/* Inline modal reutilizando o mesmo componente do dashboard */
function NovoAtendimentoInline({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [leadType, setLeadType] = useState<'B2C'|'B2B'>('B2C')
  const [form, setForm] = useState({ nomeCliente:'', telefone:'', email:'', veiculo:'', placa:'', praca:'', cnpj:'', empresaNome:'', frota:'', segmento:'', doresIdentificadas:'' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  function set(k: string, v: string) { setForm(f => ({...f, [k]: v})) }

  async function handleSave() {
    if (!form.nomeCliente || !form.telefone) { setErr('Nome e telefone obrigatórios'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/vendedor/leads', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...form, leadType}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erro')
      onSaved(); onClose()
    } catch(e: unknown) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Novo Atendimento</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['B2C','B2B'] as const).map(t => (
              <button key={t} onClick={() => setLeadType(t)}
                className={`py-2 rounded-xl border text-sm font-semibold transition-all ${leadType===t ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                {t === 'B2C' ? '🚗 PF' : '🏢 Empresa'}
              </button>
            ))}
          </div>
          {[
            ['nomeCliente', 'Nome *', 'João da Silva'],
            ['telefone', 'Telefone *', '(11) 99999-9999'],
            ...(leadType==='B2C' ? [['placa','Placa','ABC1D23'],['veiculo','Veículo','Hilux']] : [['empresaNome','Empresa','Transportes Ltda'],['frota','Frota','20 veículos']]),
          ].map(([k,l,p]) => (
            <div key={k}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{l}</label>
              <input value={(form as Record<string,string>)[k]} onChange={e => set(k, k==='placa' ? e.target.value.toUpperCase() : e.target.value)} placeholder={p}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            </div>
          ))}
          {err && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
