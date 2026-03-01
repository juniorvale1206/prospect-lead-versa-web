'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

interface HeaderProps {
  user: { nome: string; email: string; role: string; avatarUrl?: string | null }
}

const pageLabels: Record<string, string> = {
  '/dashboard':                           'Dashboard Global',
  '/admin/tenants':                       'Gestão de Marcas',
  '/admin/usuarios':                      'Usuários',
  '/admin/configuracoes':                 'Configurações',
  '/admin/produtos':                      'Catálogo e Comissões',
  '/admin/promotores':                    'Gestão de Promotores',
  '/admin/promotores/aprovacoes':         'Fila de Aprovação',
  '/financeiro':                          'Dashboard Financeiro',
  '/financeiro/auditoria':                'Auditoria de Fotos',
  '/financeiro/comissoes':                'Comissões & Fechamento',
  '/financeiro/extratos':                 'Extratos',
  '/operacao':                            'Operação (Kanban)',
  '/operacao/equipe':                     'Equipe & Promotores',
  '/operacao/mapa':                       'Mapa de Calor',
}

const roleLabel: Record<string, string> = {
  ADMIN_MASTER:     'Admin Master',
  FINANCIAL:        'Financeiro',
  MANAGER:          'Gestor',
  PROMOTER:         'Promotor',
  PARTNER_EMPLOYEE: 'Parceiro PDV',
}

export default function Header({ user }: HeaderProps) {
  const pathname      = usePathname()
  const router        = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const pageTitle = pageLabels[pathname] || 'ProspecLead'
  const formattedDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const initials = user.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 relative">
      <div>
        <h1 className="text-slate-800 font-bold text-base">{pageTitle}</h1>
        <p className="text-slate-400 text-xs capitalize">{formattedDate}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Notificações */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white"/>
        </button>

        {/* Avatar + Dropdown */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-1.5 border border-slate-200 transition-all"
          >
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.nome} className="w-7 h-7 rounded-full object-cover"/>
              : (
                <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
              )
            }
            <div className="hidden md:block text-left">
              <p className="text-slate-700 text-sm font-semibold leading-tight">{user.nome.split(' ')[0]}</p>
              <p className="text-slate-400 text-[10px] leading-tight">{roleLabel[user.role] ?? user.role}</p>
            </div>
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform hidden md:block ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
              {/* User info */}
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt={user.nome} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow"/>
                    : (
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow">
                        <span className="text-white font-bold">{initials}</span>
                      </div>
                    )
                  }
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{user.nome}</p>
                    <p className="text-slate-400 text-xs truncate">{user.email}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 mt-0.5">
                      {roleLabel[user.role] ?? user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu */}
              <div className="py-1.5">
                <button
                  onClick={() => { setOpen(false); router.push('/admin/configuracoes') }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  Ver Perfil
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Mudar Localização
                </button>
              </div>

              <div className="border-t border-slate-100 py-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                  </svg>
                  Sair do Sistema
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
