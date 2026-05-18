'use client'

/**
 * /vendedor/dashboard — Painel do Vendedor PDV (PARTNER_EMPLOYEE)
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface VendedorStats {
  leadsHoje: number
  leadsThisMonth: number
  leadsGrowth: number
  commissionMes: number
  commissionPending: number
  stores: { id: string; name: string; cidade?: string | null }[]
  recentLeads: {
    id: string; nomeCliente: string; telefone: string
    placa?: string; leadType: string; funnelStage: string; createdAt: string
  }[]
}

const STAGE_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  LEAD_COLETADO:     { label: 'Coletado',   color: 'text-slate-600',  bg: 'bg-slate-100',  dot: 'bg-slate-400'   },
  IA_EM_ATENDIMENTO: { label: 'IA Ativa',    color: 'text-blue-600',  bg: 'bg-blue-50',    dot: 'bg-blue-500'    },
  REUNIAO_AGENDADA:  { label: 'Reunião',     color: 'text-amber-700', bg: 'bg-amber-50',   dot: 'bg-amber-400'   },
  CONVERTIDO:        { label: 'Convertido',  color: 'text-emerald-700',bg: 'bg-emerald-50',dot: 'bg-emerald-500' },
  SALE_CLOSED:       { label: 'Vendido',     color: 'text-purple-700',bg: 'bg-purple-50',  dot: 'bg-purple-500'  },
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function GrowthBadge({ v }: { v: number }) {
  if (!v) return <span className="text-xs text-slate-400">—</span>
  const up = v > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}/>
      </svg>
      {Math.abs(v)}%
    </span>
  )
}

/* ══════════════ Modal Novo Lead ══════════════ */
function NovoAtendimentoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
      const res = await fetch('/api/vendedor/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, leadType }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erro')
      onSaved(); onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Novo Atendimento</h3>
            <p className="text-sm text-slate-400">Registre o cliente no PDV</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(['B2C','B2B'] as const).map(t => (
              <button key={t} onClick={() => setLeadType(t)}
                className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  leadType === t
                    ? 'bg-blue-50 border-blue-300 text-blue-700 ring-1 ring-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {t === 'B2C' ? '🚗 Pessoa Física' : '🏢 Empresa'}
              </button>
            ))}
          </div>

          {/* Campos comuns */}
          <F label="Nome Completo *" value={form.nomeCliente} onChange={v => set('nomeCliente', v)} placeholder="João da Silva" />
          <div className="grid grid-cols-2 gap-3">
            <F label="Telefone *" value={form.telefone} onChange={v => set('telefone', v)} placeholder="(11) 99999-9999" />
            <F label="E-mail" value={form.email} onChange={v => set('email', v)} placeholder="joao@email.com" />
          </div>

          {/* B2C */}
          {leadType === 'B2C' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <F label="Placa" value={form.placa} onChange={v => set('placa', v.toUpperCase())} placeholder="ABC1D23" />
                <F label="Veículo" value={form.veiculo} onChange={v => set('veiculo', v)} placeholder="Hilux 2022" />
              </div>
              <F label="Cidade / Praça" value={form.praca} onChange={v => set('praca', v)} placeholder="São Paulo - SP" />
            </>
          )}

          {/* B2B */}
          {leadType === 'B2B' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <F label="CNPJ" value={form.cnpj} onChange={v => set('cnpj', v)} placeholder="00.000/0001-00" />
                <F label="Empresa" value={form.empresaNome} onChange={v => set('empresaNome', v)} placeholder="Transportes Ltda" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Frota" value={form.frota} onChange={v => set('frota', v)} placeholder="20 veículos" />
                <F label="Segmento" value={form.segmento} onChange={v => set('segmento', v)} placeholder="Mineração" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Observações</label>
            <textarea
              value={form.doresIdentificadas}
              onChange={e => set('doresIdentificadas', e.target.value)}
              placeholder="Interesse do cliente, necessidades..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>

          {err && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : '✓ Registrar'}
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
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
    </div>
  )
}

/* ══════════════ Dashboard ══════════════ */
export default function VendedorDashboard() {
  const [stats, setStats]     = useState<VendedorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendedor/stats')
      const d   = await res.json()
      if (d.success) setStats(d.stats)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span className="text-sm">Carregando...</span>
      </div>
    </div>
  )

  if (!stats) return <div className="py-16 text-center text-slate-400">Erro ao carregar dados.</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meu Painel PDV</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {stats.stores.length > 0
              ? stats.stores.map(s => s.name).join(' · ')
              : 'Ponto de Venda'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Novo Atendimento
          </button>
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hoje</p>
          <p className="text-3xl font-bold text-slate-800">{stats.leadsHoje}</p>
          <p className="text-xs text-slate-400 mt-1">atendimentos</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Este Mês</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-800">{stats.leadsThisMonth}</p>
            <div className="mb-1"><GrowthBadge v={stats.leadsGrowth}/></div>
          </div>
          <p className="text-xs text-slate-400 mt-1">atendimentos</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">A Receber</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(stats.commissionPending)}</p>
          <p className="text-xs text-amber-500 mt-1">comissão pendente</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 shadow-sm text-white">
          <p className="text-xs font-semibold text-blue-100 uppercase tracking-wide mb-2">Comissão/Mês</p>
          <p className="text-2xl font-bold">{fmt(stats.commissionMes)}</p>
          <p className="text-xs text-blue-100 mt-1">gerada este mês</p>
        </div>
      </div>

      {/* Lojas PDV */}
      {stats.stores.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-3">Meus PDVs</h2>
          <div className="flex flex-wrap gap-2">
            {stats.stores.map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-blue-700">{s.name}</p>
                  {s.cidade && <p className="text-xs text-blue-500">{s.cidade}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos atendimentos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">Últimos Atendimentos</h2>
          <Link href="/vendedor/leads" className="text-xs text-blue-600 hover:underline font-medium">Ver todos →</Link>
        </div>

        {stats.recentLeads.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <p className="text-slate-600 font-semibold">Nenhum atendimento ainda</p>
            <button onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              Registrar primeiro atendimento
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.recentLeads.map(l => {
              const stage = STAGE_META[l.funnelStage] ?? STAGE_META.LEAD_COLETADO
              return (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${stage.bg} ${stage.color}`}>
                    {l.nomeCliente.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.nomeCliente}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{l.telefone}</span>
                      {l.placa && <span className="text-xs font-mono font-bold text-slate-500">{l.placa}</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                      {stage.label}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(l.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NovoAtendimentoModal
          onClose={() => setShowModal(false)}
          onSaved={() => { load(); setShowModal(false) }}
        />
      )}
    </div>
  )
}
