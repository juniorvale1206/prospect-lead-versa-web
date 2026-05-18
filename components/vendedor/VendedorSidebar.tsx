'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  user: { nome: string; email: string; role: string; tenantNome?: string | null }
}

const NAV = [
  {
    section: 'Meu PDV',
    items: [
      { href: '/vendedor/dashboard', label: 'Painel',        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '/vendedor/leads',     label: 'Meus Atendimentos', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { href: '/vendedor/novo-lead', label: 'Novo Atendimento', icon: 'M12 4v16m8-8H4' },
    ],
  },
]

export default function VendedorSidebar({ user }: Props) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [out, setOut]   = useState(false)
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    setOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const initial = user.nome.charAt(0).toUpperCase()

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}/>
        </svg>
      </button>

      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)}/>}

      <aside className={`
        fixed md:relative inset-y-0 left-0 z-50
        w-60 min-h-screen bg-white border-r border-slate-200 flex flex-col shadow-sm
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-slate-800 font-bold text-sm">Prospec<span className="text-blue-600">Lead</span></p>
              <p className="text-slate-400 text-[10px]">Painel Vendedor PDV</p>
            </div>
          </div>
        </div>

        {/* Perfil */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="bg-blue-50 rounded-2xl p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white text-sm font-bold">{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 text-sm font-semibold truncate">{user.nome}</p>
                <p className="text-slate-400 text-[11px] truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>
                Vendedor PDV
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
                          ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}>
                      <svg className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon}/>
                      </svg>
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>}
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
