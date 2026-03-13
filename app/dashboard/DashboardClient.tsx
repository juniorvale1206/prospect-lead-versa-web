'use client'

/**
 * DashboardClient.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard Global — Admin ProspecLead
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CARDS SUPERIORES (4):
 *   1. Novos Leads (mês)   — total + % crescimento vs mês anterior
 *   2. Vendas Fechadas     — contratos gerados
 *   3. MRR Adicionado      — soma planValue das vendas do mês (R$)
 *   4. Saques Pendentes    — total pendente com alerta visual se > 0
 *
 * GRÁFICOS:
 *   • Donut — distribuição de origem dos leads
 *   • Barras — funil mensal de conversão
 *
 * RODAPÉ:
 *   • Leaderboard Top-3 parceiros
 *   • Feed de ações recentes (mock)
 *
 * FONTE DE DADOS: GET /api/admin/dashboard/stats
 */

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import {
  Users, TrendingUp, DollarSign, AlertTriangle,
  RefreshCw, Trophy, Zap, ArrowUpRight, ArrowDownRight,
  Bot, QrCode, Megaphone, MessageCircle,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OriginItem  { origin: string; count: number }
interface FunnelStage { stage:  string; count: number }
interface Partner     { rank: number; id: string; nome: string; type: 'PDV'|'PROMOTER'; totalLeads: number }

interface StatsData {
  leadsCount:          number
  leadsGrowth:         number
  salesCount:          number
  salesGrowth:         number
  mrrTotal:            number
  mrrGrowth:           number
  pendingWithdrawals:  number
  leadsByOrigin:       OriginItem[]
  conversionFunnel:    FunnelStage[]
  topPartners:         Partner[]
}

interface DashResponse {
  success: boolean
  period:  { start: string; end: string; label: string }
  stats:   StatsData
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants / Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN_LABELS: Record<string, string> = {
  RADAR_B2B:          'Radar B2B',
  QR_CODE_PDV:        'QR Code PDV',
  MANUAL_PDV:         'Manual PDV',
  PROMOTER_APP:       'App Promotor',
  WHATSAPP_ORGANICO:  'WhatsApp Orgânico',
  MANUAL:             'Manual',
  PDV:                'PDV (legado)',
}
const ORIGIN_COLORS = ['#6366f1','#10b981','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#06b6d4']

const FUNNEL_LABELS: Record<string, string> = {
  LEAD_COLETADO:     'Captados',
  IA_EM_ATENDIMENTO: 'Qualif. IA',
  REUNIAO_AGENDADA:  'Agendados',
  CONVERTIDO:        'Instalados',
}
const FUNNEL_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444']

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits: 0 })
}
function fmtNum(v: number) { return v.toLocaleString('pt-BR') }

// ─────────────────────────────────────────────────────────────────────────────
// Mock feed data (live events timeline)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_FEED = [
  { id:1, icon:'bot',    color:'text-violet-500', msg:'IA agendou instalação para Carlos Pereira', time:'2 min atrás' },
  { id:2, icon:'qr',     color:'text-emerald-500', msg:'PDV Posto Shell registrou 3 leads via QR Code', time:'5 min atrás' },
  { id:3, icon:'deal',   color:'text-blue-500',    msg:'Venda fechada — Plano Frota Vale • R$ 2.400/mês', time:'12 min atrás' },
  { id:4, icon:'bot',    color:'text-violet-500',  msg:'IA qualificou lead Ana Souza (B2B, 45 veículos)', time:'18 min atrás' },
  { id:5, icon:'radar',  color:'text-amber-500',   msg:'Radar B2B capturou 12 empresas em São Paulo', time:'31 min atrás' },
  { id:6, icon:'alert',  color:'text-red-500',     msg:'Saque de R$ 800 aguardando aprovação', time:'45 min atrás' },
  { id:7, icon:'qr',     color:'text-emerald-500', msg:'PDV Auto Posto Leste — novo frentista cadastrado', time:'1h atrás' },
]

function FeedIcon({ icon, color }: { icon: string; color: string }) {
  const cls = `w-4 h-4 ${color}`
  if (icon === 'bot')    return <Bot className={cls} />
  if (icon === 'qr')     return <QrCode className={cls} />
  if (icon === 'deal')   return <DollarSign className={cls} />
  if (icon === 'radar')  return <Megaphone className={cls} />
  if (icon === 'alert')  return <AlertTriangle className={cls} />
  return <MessageCircle className={cls} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, growth, icon, color, format = 'num', alert = false,
}: {
  label: string; value: number; growth: number
  icon: React.ReactNode; color: string
  format?: 'brl' | 'num'
  alert?: boolean
}) {
  const positive = growth >= 0
  const fmtVal   = format === 'brl' ? fmtBRL(value) : fmtNum(value)
  const isAlert  = alert && value > 0

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border ${isAlert ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-700'} p-5 shadow-sm`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        <div className={`p-2 rounded-xl ${color}`}>
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-bold ${isAlert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'} mb-1`}>
        {fmtVal}
      </div>
      <div className="flex items-center gap-1 text-xs">
        {growth !== 0 ? (
          <>
            {positive
              ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              : <ArrowDownRight className="w-3 h-3 text-red-500" />}
            <span className={positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {Math.abs(growth)}%
            </span>
            <span className="text-gray-400">vs mês anterior</span>
          </>
        ) : (
          <span className="text-gray-400">sem dados do mês anterior</span>
        )}
        {isAlert && (
          <span className="ml-2 text-red-500 font-medium">⚠ aguardando</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Donut Label
// ─────────────────────────────────────────────────────────────────────────────

function DonutLabel(props: { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number }) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const [data,      setData]      = useState<DashResponse | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/dashboard/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: DashResponse = await res.json()
      if (!json.success) throw new Error('API retornou erro')
      setData(json)
      setLastFetch(new Date().toLocaleTimeString('pt-BR'))
    } catch (e) {
      setError('Não foi possível carregar os dados do dashboard.')
      // fallback com mock data para não travar o layout
      setData(MOCK_DATA)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSkeleton />

  const stats  = data?.stats  ?? MOCK_DATA.stats
  const period = data?.period ?? MOCK_DATA.period

  // Prepara donut data
  const donutData = stats.leadsByOrigin.map((item, idx) => ({
    name:  ORIGIN_LABELS[item.origin] ?? item.origin,
    value: item.count,
    color: ORIGIN_COLORS[idx % ORIGIN_COLORS.length],
  }))

  // Prepara bar data (funil)
  const barData = stats.conversionFunnel.map((item, idx) => ({
    name:  FUNNEL_LABELS[item.stage] ?? item.stage,
    total: item.count,
    fill:  FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
  }))

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Global</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Período: <span className="font-medium text-gray-700 dark:text-gray-300">{period.label}</span>
            {error && <span className="ml-3 text-amber-500 text-xs">⚠ Exibindo dados de demonstração</span>}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
          {lastFetch && <span className="text-xs text-gray-400">{lastFetch}</span>}
        </button>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Novos Leads (mês)"
          value={stats.leadsCount}
          growth={stats.leadsGrowth}
          icon={<Users className="w-4 h-4 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-900/30"
          format="num"
        />
        <KpiCard
          label="Vendas Fechadas"
          value={stats.salesCount}
          growth={stats.salesGrowth}
          icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-900/30"
          format="num"
        />
        <KpiCard
          label="MRR Adicionado"
          value={stats.mrrTotal}
          growth={stats.mrrGrowth}
          icon={<DollarSign className="w-4 h-4 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-900/30"
          format="brl"
        />
        <KpiCard
          label="Saques Pendentes"
          value={stats.pendingWithdrawals}
          growth={0}
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
          color="bg-red-50 dark:bg-red-900/30"
          format="brl"
          alert={true}
        />
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — Origem dos Leads */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
            Origem dos Leads
          </h2>
          {donutData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    dataKey="value"
                    labelLine={false}
                    label={DonutLabel}
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v?: number | string) => [`${fmtNum(Number(v ?? 0))} leads`, '']}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2">
                {donutData.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                    <span className="text-gray-600 dark:text-gray-400 flex-1">{item.name}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{fmtNum(item.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados de origem no período</p>
          )}
        </div>

        {/* Bar — Funil de Conversão */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
            Funil Mensal de Conversão
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v?: number | string) => [fmtNum(Number(v ?? 0)), 'Leads']}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="total" radius={[6,6,0,0]}>
                {barData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Footer Row: Leaderboard + Feed ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top-3 Partners */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Top 3 Parceiros do Mês</h2>
          </div>
          <div className="space-y-3">
            {stats.topPartners.length > 0 ? stats.topPartners.map((p) => {
              const medals = ['🥇','🥈','🥉']
              const isPromoter = p.type === 'PROMOTER'
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-xl w-8 text-center">{medals[p.rank - 1] ?? p.rank}</span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isPromoter ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.nome}</p>
                    <p className="text-xs text-gray-500">{isPromoter ? 'Promotor' : 'PDV'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{fmtNum(p.totalLeads)}</p>
                    <p className="text-xs text-gray-400">leads</p>
                  </div>
                </div>
              )
            }) : (
              <p className="text-sm text-gray-400 text-center py-6">Sem dados no período</p>
            )}
          </div>
        </div>

        {/* Live Feed */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Ações Recentes</h2>
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ao vivo
            </span>
          </div>
          <ul className="space-y-3">
            {MOCK_FEED.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FeedIcon icon={item.icon} color={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{item.msg}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data (fallback quando API falha ou sem dados)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_DATA: DashResponse = {
  success: true,
  period: { start: '', end: '', label: 'Março/2026' },
  stats: {
    leadsCount:         87,
    leadsGrowth:        12.5,
    salesCount:         14,
    salesGrowth:        8.3,
    mrrTotal:           15400,
    mrrGrowth:          21.0,
    pendingWithdrawals: 2300,
    leadsByOrigin: [
      { origin: 'RADAR_B2B',         count: 31 },
      { origin: 'QR_CODE_PDV',       count: 23 },
      { origin: 'PROMOTER_APP',      count: 18 },
      { origin: 'WHATSAPP_ORGANICO', count: 15 },
    ],
    conversionFunnel: [
      { stage: 'LEAD_COLETADO',     count: 87 },
      { stage: 'IA_EM_ATENDIMENTO', count: 54 },
      { stage: 'REUNIAO_AGENDADA',  count: 22 },
      { stage: 'CONVERTIDO',        count: 14 },
    ],
    topPartners: [
      { rank: 1, id: '1', nome: 'Posto Shell Anhangabaú', type: 'PDV',      totalLeads: 23 },
      { rank: 2, id: '2', nome: 'Ana Silva',              type: 'PROMOTER', totalLeads: 19 },
      { rank: 3, id: '3', nome: 'Loja Rastremix Centro',  type: 'PDV',      totalLeads: 17 },
    ],
  },
}
