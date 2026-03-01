'use client'

import { usePathname } from 'next/navigation'

interface HeaderProps {
  user: {
    nome: string
    email: string
    role: string
  }
}

const pageLabels: Record<string, string> = {
  '/dashboard': 'Dashboard Global',
  '/admin/tenants': 'Gestão de Marcas',
  '/admin/usuarios': 'Usuários',
  '/admin/configuracoes': 'Configurações',
  '/financeiro': 'Dashboard Financeiro',
  '/financeiro/auditoria': 'Auditoria de Placas',
  '/financeiro/comissoes': 'Comissões',
  '/financeiro/extratos': 'Extratos',
  '/operacao': 'Operação (Kanban)',
  '/operacao/equipe': 'Equipe & Promotores',
  '/operacao/mapa': 'Mapa de Calor',
}

export default function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const pageTitle = pageLabels[pathname] || 'ProspecLead'

  const now = new Date()
  const formattedDate = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div>
        <h1 className="text-white font-semibold text-base">{pageTitle}</h1>
        <p className="text-gray-500 text-xs capitalize">{formattedDate}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Notificações */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full"></span>
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-1.5">
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user.nome.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-gray-300 text-sm hidden md:block">{user.nome}</span>
        </div>
      </div>
    </header>
  )
}
