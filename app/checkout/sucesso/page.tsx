'use client'

/**
 * Página de Sucesso do Checkout
 * Exibida após pagamento confirmado pelo Stripe
 *
 * Query params:
 *   session_id  — ID da sessão Stripe
 *   order_id    — ID do pedido criado
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface OrderStatus {
  orderNumber: string
  planName: string
  planType: string
  statusInfo: { label: string; color: string; icon: string }
  valores: { total: number; liquido: number }
  cliente: { nome: string; email: string }
  activatedAt: string | null
  createdAt: string
}

function SucessoContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get('order_id')
  const sessionId = searchParams.get('session_id')

  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(15)

  useEffect(() => {
    if (!orderId) return
    fetch(`/api/pagamentos/status?orderId=${orderId}`)
      .then(r => r.json())
      .then(data => { setOrder(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [orderId])

  // Countdown para redirecionar ao painel
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push('/admin/pedidos')
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [router])

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Ícone de sucesso animado */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-200 animate-bounce-once">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-green-800">Pagamento Confirmado!</h1>
          <p className="text-green-600 mt-2">Seu plano foi ativado com sucesso 🎉</p>
        </div>

        {/* Card de resumo */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : order ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pedido</span>
                <span className="text-sm font-mono font-bold text-slate-800">#{order.orderNumber}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-y border-slate-100">
                <div>
                  <p className="font-semibold text-slate-800">{order.planName}</p>
                  <p className="text-xs text-slate-500">{order.planType === 'ANNUAL' ? 'Plano Anual' : 'Plano Mensal'}</p>
                </div>
                <span className="text-xl font-extrabold text-green-700">
                  {fmtBRL(order.valores.total)}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Cliente</span>
                  <span className="font-medium">{order.cliente.nome}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>E-mail</span>
                  <span className="font-medium">{order.cliente.email}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Ativação</span>
                  <span className="font-medium text-green-600">
                    {order.activatedAt ? fmtDate(order.activatedAt) : 'Imediata'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-500">
              <p>Pedido processado com sucesso.</p>
              {sessionId && <p className="text-xs mt-1 font-mono text-slate-400">{sessionId}</p>}
            </div>
          )}
        </div>

        {/* Cross-Sell Banner (VAPEC Policy) */}
        <div className="bg-amber-50 border-2 border-dashed border-amber-400 rounded-2xl p-5 mb-6">
          <span className="inline-block px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full mb-2">
            🎯 OFERTA ESPECIAL
          </span>
          <h3 className="text-lg font-bold text-amber-900 mb-1">
            Rastreador Portátil Valeteck
          </h3>
          <p className="text-sm text-amber-700 mb-3">
            Adicione monitoramento independente à sua frota. <strong>R$ 249,00</strong> com instalação inclusa.
          </p>
          <button
            onClick={() => router.push('/checkout?plan=topypro_mensal')}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors"
          >
            Ver detalhes →
          </button>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/admin/pedidos')}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors"
          >
            Ver meus pedidos
          </button>
          <button
            onClick={() => router.push('/checkout')}
            className="w-full py-3 border-2 border-slate-200 hover:border-green-400 text-slate-700 rounded-xl font-medium transition-colors"
          >
            + Novo pedido
          </button>
        </div>

        {/* Countdown */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Redirecionando automaticamente em{' '}
          <span className="font-bold text-green-600">{countdown}s</span>...
        </p>
      </div>
    </div>
  )
}

export default function SucessoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    }>
      <SucessoContent />
    </Suspense>
  )
}
