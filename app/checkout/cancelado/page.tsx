'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CanceladoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order_id')

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-2">Pagamento Cancelado</h1>
        <p className="text-slate-500 mb-2">
          Você cancelou o processo de pagamento. Seu pedido foi salvo como rascunho e pode ser retomado a qualquer momento.
        </p>
        {orderId && (
          <p className="text-xs text-slate-400 font-mono mb-6">
            Referência: {orderId}
          </p>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700 text-left">
          <p className="font-semibold mb-1">💡 Precisa de ajuda?</p>
          <p>Entre em contato com nosso time de suporte para tirar dúvidas sobre planos e formas de pagamento.</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.back()}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors"
          >
            ← Tentar novamente
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CanceladoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" /></div>}>
      <CanceladoContent />
    </Suspense>
  )
}
