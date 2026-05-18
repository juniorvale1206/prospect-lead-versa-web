'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  user: { nome: string; email: string; role: string; tenantNome?: string | null }
}

const NAV = [
  {
    section: 'Meu Painel',
    items: [
      { href: '/promotor/dashboard', label: 'Dashboard',      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '/promotor/leads',     label: 'Meus Leads',     icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '/promotor/vendas',    label: 'Minhas Vendas',  icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/promotor/comissoes', label: 'Comissões',      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
]

export default function PromoterSidebar({ user }: Props) {
  const pathname   = usePathname()
  const router     = useRouter()
  const [out, setOut] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    setOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const initial = user.nome.charAt(0).toUpperCase()

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}/>
        </svg>
      </button>

      {/* Overlay mobile */}
      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative inset-y-0 left-0 z-50
        w-60 min-h-screen bg-white border-r border-slate-200 flex flex-col shadow-sm
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo + título */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-5 h-5">
                <path d="M30 15 C30 15 20 15 20 25 L20 62 C20 72 30 72 30 72 L30 84 L48 72 L74 72 C74 72 84 72 84 62 L84 25 C84 15 74 15 74 15 Z" fill="white"/>
                <text x="52" y="57" textAnchor="middle" fontSize="32" fontWeight="bold" fill="#10b981" fontFamily="Arial">P</text>
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-slate-800 font-bold text-sm">Prospec<span className="text-emerald-600">Lead</span></p>
              <p className="text-slate-400 text-[10px]">Painel Promotor</p>
            </div>
          </div>
        </div>

        {/* Perfil */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="bg-emerald-50 rounded-2xl p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white text-sm font-bold">{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 text-sm font-semibold truncate">{user.nome}</p>
                <p className="text-slate-400 text-[11px] truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>
                Promotor
              </span>
              {user.tenantNome && (
                <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {user.tenantNome}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV.map(sec => (
            <div key={sec.section}>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest px-3 mb-1.5">{sec.section}</p>
              <div className="space-y-0.5">
                {sec.items.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}>
                      <svg className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon}/>
                      </svg>
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-slate-100">
          <button onClick={handleLogout} disabled={out}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50 group">
            <svg className="w-[18px] h-[18px] text-slate-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            {out ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </aside>
    </>
  )
}
