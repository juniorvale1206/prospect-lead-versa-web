'use client'

/**
 * Dashboard de Pagamentos — Admin ProspecLead
 *
 * Exibe:
 *   • KPIs: receita total, pedidos ativos, taxa de conversão, ticket médio
 *   • Lista de pedidos com status de pagamento
 *   • Filtros por status, tipo, período
 *   • Link direto para nova assinatura (checkout)
 *   • Status de configuração Stripe
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Order {
  id: string
  orderNumber: string
  orderType: string
  status: string
  clientName: string | null
  clientEmail: string | null
  planName: string | null
  planType: string | null
  totalValue: number
  netValue: number
  paymentMethod: string | null
  promoter: { nome: string } | null
  createdAt: string
  activatedAt: string | null
}

interface Stats {
  totalOrders: number
  activeOrders: number
  totalRevenue: number
  avgTicket: number
  conversionRate: number
  draftOrders: number
  cancelledOrders: number
  pendingOrders: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:      { label: 'Rascunho',    color: 'text-slate-600', bg: 'bg-slate-100' },
  PENDING:    { label: 'Pendente',    color: 'text-amber-700', bg: 'bg-amber-100' },
  ACTIVE:     { label: 'Ativo',       color: 'text-green-700', bg: 'bg-green-100' },
  CANCELLED:  { label: 'Cancelado',  color: 'text-red-700',   bg: 'bg-red-100'   },
  COMPLETED:  { label: 'Concluído',  color: 'text-blue-700',  bg: 'bg-blue-100'  },
}

const METHOD_LABELS: Record<string, string> = {
  PIX: '🔵 PIX', CREDIT_CARD: '💳 Cartão', BOLETO: '🏦 Boleto',
  DINHEIRO: '💵 Dinheiro', CARD: '💳 Cartão',
}

export default function PagamentosPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', orderType: '', search: '' })
  const [stripeOk, setStripeOk] = useState<boolean | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    loadData()
  }, [filter, page])

  async function loadData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.orderType ? { orderType: filter.orderType } : {}),
        ...(filter.search ? { search: filter.search } : {}),
      })

      const [ordersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/orders?${params}`),
        fetch(`/api/admin/orders?stats=true`),
      ])

      if (ordersRes.ok) {
        const data = await ordersRes.json()
        setOrders(data.orders ?? [])
        setTotal(data.total ?? 0)
      }

      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data.stats ?? null)
      }

      // Verifica se Stripe está configurado
      const planosRes = await fetch('/api/pagamentos/planos')
      setStripeOk(planosRes.ok)
    } catch {
      setStripeOk(false)
    } finally {
      setLoading(false)
    }
  }

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const kpis = [
    {
      label: 'Receita Total',
      value: fmtBRL(stats?.totalRevenue ?? 0),
      icon: '💰',
      color: 'text-green-700',
      bg: 'bg-green-50 border-green-200',
    },
    {
      label: 'Contratos Ativos',
      value: String(stats?.activeOrders ?? 0),
      icon: '✅',
      color: 'text-blue-700',
      bg: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Ticket Médio',
      value: fmtBRL(stats?.avgTicket ?? 0),
      icon: '📊',
      color: 'text-purple-700',
      bg: 'bg-purple-50 border-purple-200',
    },
    {
      label: 'Taxa de Conversão',
      value: `${(stats?.conversionRate ?? 0).toFixed(1)}%`,
      icon: '📈',
      color: 'text-amber-700',
      bg: 'bg-amber-50 border-amber-200',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">💳 Pagamentos & Assinaturas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerenciamento de pedidos, planos e receitas
          </p>
        </div>
        <Link
          href="/checkout"
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
        >
          <span>+</span> Nova Assinatura
        </Link>
      </div>

      {/* Banner Stripe não configurado */}
      {stripeOk === false && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800">Stripe não configurado</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Configure as chaves da API Stripe para habilitar pagamentos online.{' '}
              <Link href="/admin/configuracoes" className="underline font-medium">
                Ir para Configurações →
              </Link>
            </p>
            <div className="mt-2 bg-amber-100 rounded-lg p-3 font-mono text-xs text-amber-900">
              <p>STRIPE_SECRET_KEY=sk_test_...</p>
              <p>STRIPE_WEBHOOK_SECRET=whsec_...</p>
              <p>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...</p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className={`rounded-xl border p-5 ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{kpi.icon}</span>
              <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Mini stats secundárias */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{stats.draftOrders}</p>
            <p className="text-xs text-slate-400 mt-1">Rascunhos</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.pendingOrders}</p>
            <p className="text-xs text-slate-400 mt-1">Aguardando Pagamento</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.cancelledOrders}</p>
            <p className="text-xs text-slate-400 mt-1">Cancelados</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="🔍 Buscar por cliente, pedido..."
            value={filter.search}
            onChange={e => { setFilter(p => ({ ...p, search: e.target.value })); setPage(1) }}
            className="flex-1 min-w-48 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={filter.status}
            onChange={e => { setFilter(p => ({ ...p, status: e.target.value })); setPage(1) }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Todos os status</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PENDING">Pendente</option>
            <option value="ACTIVE">Ativo</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="COMPLETED">Concluído</option>
          </select>
          <select
            value={filter.orderType}
            onChange={e => { setFilter(p => ({ ...p, orderType: e.target.value })); setPage(1) }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">B2B + B2C</option>
            <option value="B2C">B2C (Pessoa Física)</option>
            <option value="B2B">B2B (Empresa)</option>
          </select>
          <button
            onClick={() => { setFilter({ status: '', orderType: '', search: '' }); setPage(1) }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela de pedidos */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">
            Pedidos <span className="text-slate-400 font-normal text-sm">({total})</span>
          </h2>
          <Link href="/checkout" className="text-sm text-purple-600 hover:underline">
            + Novo pedido
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="text-5xl mb-3">📋</span>
            <p className="font-medium">Nenhum pedido encontrado</p>
            <p className="text-sm mt-1">Crie sua primeira assinatura</p>
            <Link
              href="/checkout"
              className="mt-4 px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
            >
              + Nova Assinatura
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Pedido</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Pagamento</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map(order => {
                  const st = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.DRAFT
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-700">
                            #{order.orderNumber}
                          </span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            order.orderType === 'B2B'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {order.orderType}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-medium text-slate-800">{order.clientName ?? '—'}</p>
                          <p className="text-xs text-slate-400">{order.clientEmail ?? ''}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-medium text-slate-700">{order.planName ?? '—'}</p>
                          <p className="text-xs text-slate-400">
                            {order.planType === 'ANNUAL' ? '📅 Anual' : '📅 Mensal'}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800">{fmtBRL(order.totalValue)}</p>
                        <p className="text-xs text-slate-400">Líq: {fmtBRL(order.netValue)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm">{METHOD_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '—'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {fmtDate(order.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/pedidos/${order.id}`}
                            className="text-xs text-purple-600 hover:underline"
                          >
                            Ver
                          </Link>
                          {order.status === 'DRAFT' && (
                            <Link
                              href={`/checkout?orderId=${order.id}`}
                              className="text-xs text-green-600 hover:underline"
                            >
                              Pagar
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {total > 20 && (
          <div className="px-5 py-4 border-t flex items-center justify-between text-sm">
            <p className="text-slate-500">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total} pedidos
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                ← Anterior
              </button>
              <button
                disabled={page * 20 >= total}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Próximo →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guia de configuração Stripe */}
      {stripeOk === false && (
        <div className="bg-slate-800 text-white rounded-xl p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span>🔧</span> Como configurar o Stripe
          </h3>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
            <li>Acesse <a href="https://dashboard.stripe.com" target="_blank" className="text-purple-400 hover:underline">dashboard.stripe.com</a> e crie uma conta</li>
            <li>Copie a <strong className="text-white">Chave Secreta</strong> (sk_test_...) e a <strong className="text-white">Chave Pública</strong> (pk_test_...)</li>
            <li>Adicione ao arquivo <code className="bg-slate-700 px-1 rounded">.env</code> do projeto</li>
            <li>Para webhooks em produção: configure o endpoint <code className="bg-slate-700 px-1 rounded">/api/webhooks/stripe</code> no painel Stripe</li>
            <li>Reinicie o servidor: <code className="bg-slate-700 px-1 rounded">pm2 restart prospeclead</code></li>
          </ol>
          <div className="mt-4 bg-slate-700 rounded-lg p-3 font-mono text-xs text-slate-200">
            <p className="text-slate-400"># .env</p>
            <p>STRIPE_SECRET_KEY=sk_test_xxxx</p>
            <p>STRIPE_WEBHOOK_SECRET=whsec_xxxx</p>
            <p>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx</p>
          </div>
        </div>
      )}
    </div>
  )
}
