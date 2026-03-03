'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface Session { role: string; nome: string; tenantId: string | null }

interface Campaign {
  id: string
  name: string
  templateName: string
  status: string
  audienceCount: number
  totalSent: number
  totalDelivered: number
  totalRead: number
  totalReplied: number
  totalFailed: number
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  tenant?: { id: string; nome: string; slug: string }
  _count?: { messages: number }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock de campanhas (exibição imediata enquanto não há dados reais)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'cmp_001',
    name: 'Reativação Leads Frios — Maio 2025',
    templateName: 'reativacao_lead_frio',
    status: 'COMPLETED',
    audienceCount: 847,
    totalSent: 847,
    totalDelivered: 812,
    totalRead: 634,
    totalReplied: 87,
    totalFailed: 35,
    scheduledAt: null,
    startedAt: '2025-05-10T09:00:00Z',
    completedAt: '2025-05-10T09:18:00Z',
    createdAt: '2025-05-09T15:30:00Z',
    tenant: { id: 't1', nome: 'ProspecLead Demo', slug: 'demo' },
    _count: { messages: 847 },
  },
  {
    id: 'cmp_002',
    name: 'Promoção Rastreador — Black Friday',
    templateName: 'rastreador_promo_anual',
    status: 'COMPLETED',
    audienceCount: 2340,
    totalSent: 2340,
    totalDelivered: 2201,
    totalRead: 1890,
    totalReplied: 312,
    totalFailed: 139,
    scheduledAt: '2025-05-24T08:00:00Z',
    startedAt: '2025-05-24T08:00:00Z',
    completedAt: '2025-05-24T09:02:00Z',
    createdAt: '2025-05-22T11:00:00Z',
    tenant: { id: 't1', nome: 'ProspecLead Demo', slug: 'demo' },
    _count: { messages: 2340 },
  },
  {
    id: 'cmp_003',
    name: 'Frota Vale — Sensor de Fadiga',
    templateName: 'sensor_fadiga_mineracao',
    status: 'RUNNING',
    audienceCount: 156,
    totalSent: 89,
    totalDelivered: 82,
    totalRead: 67,
    totalReplied: 14,
    totalFailed: 7,
    scheduledAt: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    tenant: { id: 't1', nome: 'ProspecLead Demo', slug: 'demo' },
    _count: { messages: 89 },
  },
  {
    id: 'cmp_004',
    name: 'Bloqueio de Partida — Frotas B2B',
    templateName: 'bloqueio_partida_frota',
    status: 'SCHEDULED',
    audienceCount: 423,
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalReplied: 0,
    totalFailed: 0,
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    startedAt: null,
    completedAt: null,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    tenant: { id: 't1', nome: 'ProspecLead Demo', slug: 'demo' },
    _count: { messages: 0 },
  },
  {
    id: 'cmp_005',
    name: 'Campanha Junho — Novos Leads',
    templateName: 'rastreador_promo_anual',
    status: 'DRAFT',
    audienceCount: 298,
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalReplied: 0,
    totalFailed: 0,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    tenant: { id: 't1', nome: 'ProspecLead Demo', slug: 'demo' },
    _count: { messages: 0 },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  SCHEDULED: { label: 'Agendada',   color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  RUNNING:   { label: 'Executando', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  PAUSED:    { label: 'Pausada',    color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  COMPLETED: { label: 'Concluída',  color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  FAILED:    { label: 'Falhou',     color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
}

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function CampanhasDashboard({ session }: { session: Session }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS)
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Carrega campanhas reais da API (sobrepõe o mock quando disponível)
  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      if (data.success && data.campaigns?.length > 0) {
        setCampaigns(data.campaigns)
      }
    } catch { /* mantém mock */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  // Filtros
  const filtered = campaigns.filter(c => {
    const matchStatus = !filterStatus || c.status === filterStatus
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.templateName.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Métricas globais
  const totalSent      = campaigns.reduce((s, c) => s + c.totalSent,      0)
  const totalDelivered = campaigns.reduce((s, c) => s + c.totalDelivered, 0)
  const totalRead      = campaigns.reduce((s, c) => s + c.totalRead,      0)
  const totalReplied   = campaigns.reduce((s, c) => s + c.totalReplied,   0)
  const runningCount   = campaigns.filter(c => c.status === 'RUNNING').length

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      setCampaigns(cs => cs.filter(c => c.id !== id))
    } finally { setDeletingId(null) }
  }

  async function handleLaunch(id: string) {
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      setCampaigns(cs => cs.map(c => c.id === id ? { ...c, status: 'RUNNING', startedAt: new Date().toISOString() } : c))
    } else {
      alert(data.error?.message ?? 'Erro ao iniciar campanha')
    }
  }

  return (
    <div className="space-y-6">
      {/* Título + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie disparos em massa com templates aprovados pela Meta</p>
        </div>
        <Link
          href="/campanhas/nova"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Campanha
        </Link>
      </div>

      {/* Cards de métricas globais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Enviadas', value: totalSent.toLocaleString('pt-BR'), icon: '📤', color: 'text-blue-600' },
          { label: 'Entregues', value: totalDelivered.toLocaleString('pt-BR'), icon: '✅', color: 'text-green-600', sub: `${pct(totalDelivered, totalSent)}%` },
          { label: 'Lidas', value: totalRead.toLocaleString('pt-BR'), icon: '👁️', color: 'text-purple-600', sub: `${pct(totalRead, totalSent)}%` },
          { label: 'Respondidas', value: totalReplied.toLocaleString('pt-BR'), icon: '💬', color: 'text-orange-600', sub: `${pct(totalReplied, totalSent)}%` },
          { label: 'Em Execução', value: String(runningCount), icon: '🔄', color: 'text-yellow-600' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
                {m.sub && <p className="text-xs text-gray-400 mt-0.5">{m.sub} da base</p>}
              </div>
              <span className="text-2xl">{m.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome ou template..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                filterStatus === s
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === '' ? 'Todas' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <button
          onClick={loadCampaigns}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Tabela de campanhas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Desktop table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Campanha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Audiência</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Enviadas</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entregues</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lidas</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Respostas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Criada em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <p className="font-medium">Nenhuma campanha encontrada</p>
                      <Link href="/campanhas/nova" className="text-green-600 text-sm hover:underline">Criar primeira campanha →</Link>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(campaign => {
                const st = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG['DRAFT']
                const deliverRate = pct(campaign.totalDelivered, campaign.totalSent)
                const readRate    = pct(campaign.totalRead,      campaign.totalSent)
                const replyRate   = pct(campaign.totalReplied,   campaign.totalSent)
                const progress    = campaign.audienceCount > 0 ? pct(campaign.totalSent, campaign.audienceCount) : 0

                return (
                  <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                    {/* Campanha */}
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900 leading-tight">{campaign.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">{campaign.templateName}</div>
                      {/* Barra de progresso para campanhas em execução */}
                      {campaign.status === 'RUNNING' && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                            <span>Progresso</span>
                            <span>{campaign.totalSent}/{campaign.audienceCount}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-400 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${campaign.status === 'RUNNING' ? 'animate-pulse' : ''}`} />
                        {st.label}
                      </span>
                      {campaign.scheduledAt && campaign.status === 'SCHEDULED' && (
                        <p className="text-xs text-gray-400 mt-1">{fmtDate(campaign.scheduledAt)}</p>
                      )}
                    </td>

                    {/* Audiência */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-gray-700">{campaign.audienceCount.toLocaleString('pt-BR')}</span>
                      <p className="text-xs text-gray-400">leads</p>
                    </td>

                    {/* Enviadas */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-blue-600">{campaign.totalSent.toLocaleString('pt-BR')}</span>
                      {campaign.totalFailed > 0 && (
                        <p className="text-xs text-red-400">{campaign.totalFailed} falhas</p>
                      )}
                    </td>

                    {/* Entregues */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-green-600">{campaign.totalDelivered.toLocaleString('pt-BR')}</span>
                      <p className="text-xs text-gray-400">{deliverRate}%</p>
                    </td>

                    {/* Lidas */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-purple-600">{campaign.totalRead.toLocaleString('pt-BR')}</span>
                      <p className="text-xs text-gray-400">{readRate}%</p>
                    </td>

                    {/* Respostas */}
                    <td className="px-4 py-4 text-right">
                      <span className={`font-bold ${replyRate >= 10 ? 'text-orange-600' : 'text-gray-600'}`}>
                        {campaign.totalReplied.toLocaleString('pt-BR')}
                      </span>
                      <p className="text-xs text-gray-400">{replyRate}% taxa</p>
                    </td>

                    {/* Data */}
                    <td className="px-4 py-4 text-gray-500 text-xs whitespace-nowrap">
                      {fmtDate(campaign.createdAt)}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {/* Botão Iniciar (DRAFT ou SCHEDULED) */}
                        {['DRAFT', 'SCHEDULED'].includes(campaign.status) && (
                          <button
                            onClick={() => handleLaunch(campaign.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Iniciar campanha"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {/* Botão Editar */}
                        {['DRAFT', 'SCHEDULED'].includes(campaign.status) && (
                          <button
                            onClick={() => router.push(`/campanhas/${campaign.id}/editar`)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {/* Ver detalhes */}
                        <button
                          onClick={() => router.push(`/campanhas/${campaign.id}`)}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Ver detalhes"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {/* Excluir */}
                        {!['RUNNING', 'SCHEDULED'].includes(campaign.status) && (
                          <button
                            onClick={() => handleDelete(campaign.id)}
                            disabled={deletingId === campaign.id}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Excluir"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer da tabela */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {filtered.length} de {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-400">
            Status atualizados via Webhook Meta · <span className="text-green-600">● ativo</span>
          </p>
        </div>
      </div>

      {/* Funil de conversão agregado */}
      {totalSent > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Funil de Conversão — Todas as Campanhas
          </h2>
          <div className="flex items-end gap-3 h-32">
            {[
              { label: 'Enviadas',   value: totalSent,      color: 'bg-blue-500',   pctVal: 100 },
              { label: 'Entregues',  value: totalDelivered, color: 'bg-green-500',  pctVal: pct(totalDelivered, totalSent) },
              { label: 'Lidas',      value: totalRead,      color: 'bg-purple-500', pctVal: pct(totalRead, totalSent) },
              { label: 'Respondidas',value: totalReplied,   color: 'bg-orange-500', pctVal: pct(totalReplied, totalSent) },
            ].map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="text-xs font-bold text-gray-700">{bar.pctVal}%</div>
                <div className="w-full flex items-end" style={{ height: 80 }}>
                  <div
                    className={`w-full ${bar.color} rounded-t-lg transition-all`}
                    style={{ height: `${Math.max(4, bar.pctVal)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 text-center leading-tight">{bar.label}</div>
                <div className="text-xs font-semibold text-gray-700">{bar.value.toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
