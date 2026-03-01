import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function FinanceiroDashboard() {
  const session = await getSession()
  if (!session) redirect('/login')

  const stats = [
    { label: 'Receita do Mês', value: 'R$ 89.420', icon: '💰', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', sub: '+12% vs mês anterior' },
    { label: 'Comissões a Pagar', value: 'R$ 14.820', icon: '⏳', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', sub: '3 pendentes de auditoria' },
    { label: 'Extratos Gerados', value: '127', icon: '📄', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', sub: 'Este mês' },
  ]

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-white text-xl">💼</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Dashboard Financeiro</h2>
            <p className="text-slate-500 text-sm">Bem-vindo, <span className="text-blue-600 font-semibold">{session.nome}</span></p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 shadow-sm`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">{s.label}</p>
                <p className={`text-2xl font-black mt-1 ${s.text}`}>{s.value}</p>
                <p className="text-slate-400 text-xs mt-1">{s.sub}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Acesso Rápido */}
      <div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Acesso Rápido</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/financeiro/auditoria', label: 'Auditoria de Fotos', desc: '3 aguardando análise', icon: '🔍', badge: '3', badgeColor: 'bg-amber-500' },
            { href: '/financeiro/comissoes', label: 'Comissões', desc: 'Gestão de pagamentos', icon: '💵', badge: null, badgeColor: '' },
            { href: '/financeiro/extratos', label: 'Extratos', desc: 'Relatórios e extratos', icon: '📊', badge: null, badgeColor: '' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition-all group shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{item.icon}</span>
                {item.badge && (
                  <span className={`${item.badgeColor} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>{item.badge}</span>
                )}
              </div>
              <p className="text-slate-800 font-semibold text-sm group-hover:text-blue-700 transition-colors">{item.label}</p>
              <p className="text-slate-400 text-xs mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
