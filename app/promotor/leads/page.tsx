'use client'

/**
 * /promotor/leads — Lista de leads do promotor com modal de cadastro
 */

import { useState, useEffect, useCallback } from 'react'

interface Lead {
  id: string
  nomeCliente: string
  telefone: string
  email?: string
  veiculo: string
  placa: string
  leadType: string
  funnelStage: string
  empresaNome?: string
  frota?: string
  createdAt: string
}

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  LEAD_COLETADO:     { label: 'Coletado',    color: 'text-slate-600',  bg: 'bg-slate-100'   },
  IA_EM_ATENDIMENTO: { label: 'IA Atendendo', color: 'text-blue-600',  bg: 'bg-blue-50'     },
  REUNIAO_AGENDADA:  { label: 'Reunião',      color: 'text-amber-700', bg: 'bg-amber-50'    },
  CONVERTIDO:        { label: 'Convertido',   color: 'text-emerald-700',bg: 'bg-emerald-50' },
  SALE_CLOSED:       { label: 'Vendido',      color: 'text-purple-700',bg: 'bg-purple-50'   },
  LOST:              { label: 'Perdido',      color: 'text-red-600',   bg: 'bg-red-50'      },
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

/* ── Modal Novo Lead ── */
function NovoLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [leadType, setLeadType] = useState<'B2C'|'B2B'>('B2C')
  const [form, setForm] = useState({
    nomeCliente: '', telefone: '', email: '',
    veiculo: '', placa: '', praca: '',
    cnpj: '', empresaNome: '', frota: '', segmento: '',
    doresIdentificadas: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function set(k: string, v: string) { setForm(f => ({...f, [k]: v})) }

  async function handleSave() {
    if (!form.nomeCliente.trim() || !form.telefone.trim()) {
      setErr('Nome e telefone são obrigatórios.')
      return
    }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/promotor/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, leadType }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erro')
      onSaved()
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Novo Lead</h3>
            <p className="text-sm text-slate-400">Preencha os dados do cliente</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Tipo de Lead</label>
            <div className="grid grid-cols-2 gap-2">
              {(['B2C','B2B'] as const).map(t => (
                <button key={t} onClick={() => setLeadType(t)}
                  className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    leadType === t
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-1 ring-emerald-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {t === 'B2C' ? '🚗 Pessoa Física' : '🏢 Empresa (B2B)'}
                </button>
              ))}
            </div>
          </div>

          {/* Dados comuns */}
          <div className="grid grid-cols-1 gap-3">
            <F label="Nome Completo *" value={form.nomeCliente} onChange={v => set('nomeCliente', v)} placeholder="João da Silva" />
            <div className="grid grid-cols-2 gap-3">
              <F label="Telefone / WhatsApp *" value={form.telefone} onChange={v => set('telefone', v)} placeholder="(11) 99999-9999" />
              <F label="E-mail" value={form.email} onChange={v => set('email', v)} placeholder="joao@email.com" />
            </div>
          </div>

          {/* B2C */}
          {leadType === 'B2C' && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Dados do Veículo</p>
              <div className="grid grid-cols-2 gap-3">
                <F label="Placa" value={form.placa} onChange={v => set('placa', v.toUpperCase())} placeholder="ABC1D23" />
                <F label="Veículo" value={form.veiculo} onChange={v => set('veiculo', v)} placeholder="Toyota Hilux 2022" />
              </div>
              <F label="Praça / Cidade" value={form.praca} onChange={v => set('praca', v)} placeholder="Belo Horizonte - MG" />
            </div>
          )}

          {/* B2B */}
          {leadType === 'B2B' && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Dados da Empresa</p>
              <div className="grid grid-cols-2 gap-3">
                <F label="CNPJ" value={form.cnpj} onChange={v => set('cnpj', v)} placeholder="00.000.000/0001-00" />
                <F label="Razão Social" value={form.empresaNome} onChange={v => set('empresaNome', v)} placeholder="Transportes Silva Ltda" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Tamanho da Frota" value={form.frota} onChange={v => set('frota', v)} placeholder="50 caminhões" />
                <F label="Segmento" value={form.segmento} onChange={v => set('segmento', v)} placeholder="Mineração" />
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dores / Observações</label>
            <textarea
              value={form.doresIdentificadas}
              onChange={e => set('doresIdentificadas', e.target.value)}
              placeholder="Descreva o problema ou necessidade do cliente..."
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
            />
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : '✓ Salvar Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

function F({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
    </div>
  )
}

/* ══════════════ Página ══════════════ */
export default function MeusLeadsPage() {
  const [leads, setLeads]   = useState<Lead[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]  = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20' })
      if (search)      p.set('search', search)
      if (stageFilter) p.set('funnelStage', stageFilter)
      const res  = await fetch(`/api/promotor/leads?${p}`)
      const data = await res.json()
      setLeads(data.leads ?? [])
      setTotal(data.total ?? 0)
    } finally { setLoading(false) }
  }, [page, search, stageFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, stageFilter])

  const pages = Math.ceil(total / 20)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meus Leads</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} leads capturados</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Novo Lead
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou placa..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
          <option value="">Todos os estágios</option>
          {Object.entries(STAGE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <svg className="w-6 h-6 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Carregando...
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <p className="text-slate-500 font-medium">Nenhum lead encontrado</p>
            <button onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
              Cadastrar primeiro lead
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Cliente','Contato','Veículo / Empresa','Tipo','Status','Data'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map(l => {
                  const stage = STAGE_META[l.funnelStage] ?? STAGE_META.LEAD_COLETADO
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                            {l.nomeCliente.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">{l.nomeCliente}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-700">{l.telefone}</p>
                        {l.email && <p className="text-xs text-slate-400 truncate max-w-[140px]">{l.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {l.leadType === 'B2C' ? (
                          <div>
                            {l.placa && <p className="text-xs font-mono font-bold text-slate-700">{l.placa}</p>}
                            <p className="text-xs text-slate-500 truncate max-w-[140px]">{l.veiculo || '—'}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">{l.empresaNome || '—'}</p>
                            {l.frota && <p className="text-xs text-slate-400">{l.frota}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${l.leadType === 'B2B' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                          {l.leadType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(l.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Paginação */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Página {page} de {pages} • {total} leads</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                    </svg>
                  </button>
                  <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && <NovoLeadModal onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  )
}
