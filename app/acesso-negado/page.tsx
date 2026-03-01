'use client'

import Link from 'next/link'

export default function AcessoNegadoPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Acesso Negado</h1>
        <p className="text-gray-400 mb-2">Você não tem permissão para acessar esta página.</p>
        <p className="text-gray-500 text-sm mb-8">Seu nível de acesso não é suficiente para esta seção do sistema.</p>
        <div className="flex gap-3 justify-center">
          <Link
            href="javascript:history.back()"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors text-sm"
          >
            ← Voltar
          </Link>
          <Link
            href="/login"
            className="px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-xl border border-red-500/30 transition-colors text-sm"
          >
            Fazer Login com Outra Conta
          </Link>
        </div>
      </div>
    </div>
  )
}
