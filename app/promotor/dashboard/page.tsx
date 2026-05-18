'use client'

/**
 * /promotor/dashboard
 * Painel pessoal do Promotor — KPIs, funil, leads recentes, ranking
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* ── Tipos ── */
interface Stats {
  leadsHoje: number
  leadsThisMonth: number
  leadsGrowth: number
  salesCount: number
  salesGrowth: number
  totalVendasMes: number
  totalComissoesMes: number
  commissionPending: number
  commissionPaidMonth: number
  pedidosMes: number
  rankPosition: number | null
  funnel: { stage: string; count: number }[]
  recentLeads: {
    id: string; nomeCliente: string; telefone: string
    veiculo: string; placa: string; leadType: string
    funnelStage: string; createdAt: string
  }[]
}

/* ── Helpers ── */
const STAGE_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  LEAD_COLETADO:     { label: 'Lead Coletado',    color: 'text-slate-600',  bg: 'bg-slate-100',   dot: 'bg-slate-400'   },
  IA_EM_ATENDIMENTO: { label: 'IA Atendendo',      color: 'text-blue-600',   bg: 'bg-blue-50',     dot: 'bg-blue-500'    },
  REUNIAO_AGENDADA:  { label: 'Reunião Agendada',  color: 'text-amber-600',  bg: 'bg-amber-50',    dot: 'bg-amber-400'   },
  CONVERTIDO:        { label: 'Convertido',        color: 'text-emerald-600',bg: 'bg-emerald-50',  dot: 'bg-emerald-500' },
  SALE_CLOSED:       { label: 'Venda Fechada',     color: 'text-purple-600', bg: 'bg-purple-50',   dot: 'bg-purple-500'  },
  LOST:              { label: 'Perdido',           color: 'text-red-500',    bg: 'bg-red-50',      dot: 'bg-red-400'     },
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function GrowthBadge({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs text-slate-400">0%</span>
  const up = v > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
          d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}/>
      </svg>
      {Math.abs(v)}%
    </span>
  )
}

/* ══════════════ Página ══════════════ */
export default function PromotorDashboard() {
  const [stats, setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/promotor/stats')
      const d   = await res.json()
      if (d.success) {
        setStats(d.stats)
        setPeriod(d.period?.label ?? '')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span className="text-sm">Carregando seu painel...</span>
      </div>
    </div>
  )

  if (!stats) return (
    <div className="py-16 text-center text-slate-400">Erro ao carregar dados.</div>
  )

  /* ── funil ordenado ── */
  const funnelOrder = ['LEAD_COLETADO','IA_EM_ATENDIMENTO','REUNIAO_AGENDADA','CONVERTIDO','SALE_CLOSED','LOST']
  const sortedFunnel = [...stats.funnel].sort((a,b) => funnelOrder.indexOf(a.stage) - funnelOrder.indexOf(b.stage))
  const maxFunnel = Math.max(...sortedFunnel.map(f => f.count), 1)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meu Painel</h1>
          <p className="text-slate-500 text-sm mt-0.5 capitalize">{period}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/promotor/leads/novo"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Novo Lead
          </Link>
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Leads hoje */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads Hoje</span>
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.leadsHoje}</p>
          <p className="text-xs text-slate-400 mt-1">leads capturados hoje</p>
        </div>

        {/* Leads do mês */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads/Mês</span>
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-800">{stats.leadsThisMonth}</p>
            <div className="mb-1"><GrowthBadge v={stats.leadsGrowth}/></div>
          </div>
          <p className="text-xs text-slate-400 mt-1">vs mês anterior</p>
        </div>

        {/* Vendas do mês */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendas/Mês</span>
            <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-800">{stats.salesCount}</p>
            <div className="mb-1"><GrowthBadge v={stats.salesGrowth}/></div>
          </div>
          <p className="text-xs text-slate-400 mt-1">{fmt(stats.totalVendasMes)}</p>
        </div>

        {/* Comissão pendente */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 shadow-sm shadow-emerald-200 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-100 uppercase tracking-wide">A Receber</span>
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold">{fmt(stats.commissionPending)}</p>
          <p className="text-xs text-emerald-100 mt-1">pago este mês: {fmt(stats.commissionPaidMonth)}</p>
        </div>
      </div>

      {/* Ranking + Pedidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ranking */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col items-center justify-center text-center">
          {stats.rankPosition ? (
            <>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 text-3xl font-black
                ${stats.rankPosition === 1 ? 'bg-yellow-50 text-yellow-500' :
                  stats.rankPosition <= 3 ? 'bg-slate-100 text-slate-600' :
                  'bg-slate-50 text-slate-500'}`}>
                {stats.rankPosition === 1 ? '🥇' : stats.rankPosition === 2 ? '🥈' : stats.rankPosition === 3 ? '🥉' : `#${stats.rankPosition}`}
              </div>
              <p className="font-bold text-slate-800 text-lg">Ranking do Mês</p>
              <p className="text-slate-400 text-sm">você está em <strong className="text-slate-700">#{stats.rankPosition}</strong> lugar</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 text-2xl">🎯</div>
              <p className="font-bold text-slate-700">Sem ranking</p>
              <p className="text-slate-400 text-sm">Faça sua 1ª venda!</p>
            </>
          )}
        </div>

        {/* Pedidos do mês */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.pedidosMes}</p>
          <p className="font-semibold text-slate-600">Pedidos criados</p>
          <p className="text-slate-400 text-sm">neste mês</p>
        </div>

        {/* Comissão do mês */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
            </svg>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{fmt(stats.totalComissoesMes)}</p>
          <p className="font-semibold text-slate-600">Comissão gerada</p>
          <p className="text-slate-400 text-sm">nas vendas do mês</p>
        </div>
      </div>

      {/* Funil + Últimos leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Funil */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Funil de Leads</h2>
          {sortedFunnel.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Nenhum lead ainda.</div>
          ) : (
            <div className="space-y-3">
              {sortedFunnel.map(f => {
                const meta = STAGE_LABELS[f.stage] ?? { label: f.stage, color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' }
                const pct  = Math.round((f.count / maxFunnel) * 100)
                return (
                  <div key={f.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`}/>
                        <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{f.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${meta.dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Leads recentes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">Últimos Leads</h2>
            <Link href="/promotor/leads" className="text-xs text-emerald-600 hover:underline font-medium">Ver todos →</Link>
          </div>
          {stats.recentLeads.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
              </div>
              <p className="text-slate-500 text-sm font-medium">Nenhum lead ainda</p>
              <Link href="/promotor/leads/novo"
                className="inline-block px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
                Capturar primeiro lead
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentLeads.map(l => {
                const stage = STAGE_LABELS[l.funnelStage] ?? STAGE_LABELS.LEAD_COLETADO
                return (
                  <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${stage.bg} ${stage.color}`}>
                      {l.nomeCliente.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{l.nomeCliente}</p>
                      <div className="flex items-center gap-2">
                        {l.placa && <span className="text-[11px] text-slate-400 font-mono">{l.placa}</span>}
                        {l.veiculo && <span className="text-[11px] text-slate-400 truncate">{l.veiculo}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
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
      </div>

    </div>
  )
}
