'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  LineChart, Line, Area, AreaChart,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPI {
  value: number
  pct:   number
}
interface DashData {
  mock:         boolean
  kpis: {
    faturamento:  KPI
    leads:        KPI
    conversao:    KPI
    commissoes:   KPI
  }
  chartVendas:  { franquia: string; vendas: number; valor: number }[]
  chartFunil:   { name: string; value: number; color: string }[]
  chartDiario:  { data: string; valor: number }[]
  topPromoters: {
    rank: number; id: string; nome: string; avatar: string | null
    franquia: string; vendas: number; valorGerado: number; comissao: number
  }[]
  meta: { geradoEm: string; periodo: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtNum(v: number) {
  return v.toLocaleString('pt-BR')
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, pct, icon, color, format = 'brl',
}: {
  label: string; value: number; pct: number
  icon: React.ReactNode; color: string; format?: 'brl' | 'num' | 'pct'
}) {
  const positive = pct >= 0
  const fmtVal   = format === 'brl' ? fmtBRL(value)
                 : format === 'pct' ? `${value}%`
                 : fmtNum(value)

  return (
    <div className={`bg-white border ${color} rounded-2xl p-5 shadow-sm flex flex-col gap-3`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{fmtVal}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.replace('border-', 'bg-').replace('-200', '-100')}`}>
          {icon}
        </div>
      </div>
      {pct !== 0 && (
        <div className={`flex items-center gap-1 text-xs font-bold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
          {positive
            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
          }
          {Math.abs(pct)}% vs mês anterior
        </div>
      )}
    </div>
  )
}

// ─── Tooltip customizado para gráficos ────────────────────────────────────────
function CustomTooltipBRL({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmtBRL(p.value)}
        </p>
      ))}
    </div>
  )
}

function CustomTooltipNum({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' && p.value > 100
            ? fmtBRL(p.value)
            : fmtNum(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ h = 'h-64' }: { h?: string }) {
  return <div className={`${h} bg-slate-100 rounded-2xl animate-pulse`}/>
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function DashboardClient() {
  const [data,    setData]    = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [lastRef, setLastRef] = useState<string>('')

  useEffect(() => {
    async function fetch_() {
      try {
        const res  = await fetch('/api/admin/dashboard', { cache: 'no-store' })
        const json = await res.json()
        if (!json.success) throw new Error(json.error ?? 'Erro desconhecido')
        setData(json)
        setLastRef(new Date(json.meta.geradoEm).toLocaleTimeString('pt-BR'))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }
    fetch_()
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 font-bold text-lg">⚠️ {error}</p>
          <button onClick={() => { setError(null); setLoading(true) }}
            className="mt-3 text-indigo-600 text-sm font-semibold hover:underline">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Topo ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Dashboard Global</h1>
              <p className="text-slate-500 text-xs">Visão estratégica em tempo real do ProspecLead</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {data?.mock && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>
              Demo — dados ilustrativos
            </span>
          )}
          {lastRef && (
            <span className="text-slate-400 text-xs">Atualizado às {lastRef}</span>
          )}
          <button
            onClick={() => { setLoading(true); setError(null)
              fetch('/api/admin/dashboard', { cache: 'no-store' })
                .then(r => r.json()).then(d => { setData(d); setLastRef(new Date(d.meta?.geradoEm ?? Date.now()).toLocaleTimeString('pt-BR')) })
                .catch(e => setError(e.message))
                .finally(() => setLoading(false))
            }}
            className="p-2 bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-xl transition-all"
            title="Atualizar">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !data ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} h="h-32"/>)
        ) : (
          <>
            <KpiCard
              label="Faturamento do Mês"
              value={data.kpis.faturamento.value}
              pct={data.kpis.faturamento.pct}
              format="brl"
              color="border-emerald-200"
              icon={<svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
            />
            <KpiCard
              label="Leads Capturados"
              value={data.kpis.leads.value}
              pct={data.kpis.leads.pct}
              format="num"
              color="border-blue-200"
              icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
            />
            <KpiCard
              label="Taxa de Conversão"
              value={data.kpis.conversao.value}
              pct={data.kpis.conversao.pct}
              format="pct"
              color="border-purple-200"
              icon={<svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
            />
            <KpiCard
              label="Comissões a Pagar"
              value={data.kpis.commissoes.value}
              pct={data.kpis.commissoes.pct}
              format="brl"
              color="border-amber-200"
              icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
            />
          </>
        )}
      </div>

      {/* ── Gráficos: Barras + Pizza ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Gráfico de Barras — Desempenho por Franquia */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Desempenho por Franquia</h3>
              <p className="text-slate-400 text-xs">Volume de vendas e faturamento</p>
            </div>
          </div>
          {loading || !data ? <Skeleton/> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.chartVendas} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="franquia" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => fmtBRL(v).replace('R$\u00a0','R$ ')}/>
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltipNum/>}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}/>
                <Bar yAxisId="left" dataKey="valor" name="Faturamento (R$)" fill="#6366f1" radius={[6,6,0,0]}/>
                <Bar yAxisId="right" dataKey="vendas" name="Qtd. Vendas" fill="#a5b4fc" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gráfico de Pizza — Status do Funil */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Funil de Leads</h3>
              <p className="text-slate-400 text-xs">Distribuição por estágio</p>
            </div>
          </div>
          {loading || !data ? <Skeleton/> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.chartFunil}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.chartFunil.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color}/>
                    ))}
                  </Pie>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [fmtNum(Number(v ?? 0)), 'Leads']}/>
                </PieChart>
              </ResponsiveContainer>
              {/* Legenda manual */}
              <div className="space-y-1.5 mt-2">
                {data.chartFunil.map(item => {
                  const total = data.chartFunil.reduce((s, i) => s + i.value, 0)
                  const pct   = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0
                  return (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }}/>
                        <span className="text-xs text-slate-600 truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{fmtNum(item.value)} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Gráfico de Linha — Faturamento Diário 30 dias ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Faturamento Diário — Últimos 30 Dias</h3>
            <p className="text-slate-400 text-xs">Evolução do volume de vendas por dia</p>
          </div>
        </div>
        {loading || !data ? <Skeleton h="h-48"/> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.chartDiario} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis
                dataKey="data"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltipBRL/>}/>
              <Area
                type="monotone"
                dataKey="valor"
                name="Faturamento"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="url(#gradFat)"
                dot={false}
                activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top 5 Promotores ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Top 5 Promotores</h3>
            <p className="text-slate-400 text-xs">Ranking por valor de vendas gerado</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['#', 'Promotor', 'Franquia', 'Qtd. Vendas', 'Valor Gerado', 'Comissão'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading || !data
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-full"/></td></tr>
                  ))
                : data.topPromoters.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                          p.rank === 1 ? 'bg-amber-100 text-amber-700' :
                          p.rank === 2 ? 'bg-slate-200 text-slate-700' :
                          p.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {p.avatar
                            ? <img src={p.avatar} alt={p.nome} className="w-8 h-8 rounded-xl object-cover flex-shrink-0"/>
                            : (
                              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-700 font-bold text-xs">
                                  {p.nome.split(' ').map(n => n[0]).slice(0,2).join('')}
                                </span>
                              </div>
                            )
                          }
                          <span className="text-sm font-semibold text-slate-800">{p.nome}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                          {p.franquia}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">{p.vendas}</span>
                        <span className="text-slate-400 text-xs ml-1">venda{p.vendas !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-black text-emerald-700 text-sm">{fmtBRL(p.valorGerado)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                            <span className="font-bold text-amber-700 text-xs">{fmtBRL(p.comissao)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {!loading && data && (
          <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/20 border-t border-slate-100">
            <p className="text-slate-400 text-xs">
              Período: {data.meta.periodo}
              {data.mock && <span className="ml-2 text-amber-600 font-semibold">• Dados ilustrativos (mock)</span>}
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
