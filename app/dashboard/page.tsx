import { redirect } from 'next/navigation'
import { getSession, getRoleLabel } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const stats = [
    { label: 'Leads Hoje', value: '247', change: '+18%', positive: true,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
      bg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-emerald-700', border: 'border-emerald-100' },
    { label: 'Comissões Pendentes', value: 'R$ 14.820', change: '+5%', positive: true,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      bg: 'bg-blue-50', iconColor: 'text-blue-600', valueColor: 'text-blue-700', border: 'border-blue-100' },
    { label: 'Promotores Ativos', value: '38', change: '-2', positive: false,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
      bg: 'bg-purple-50', iconColor: 'text-purple-600', valueColor: 'text-purple-700', border: 'border-purple-100' },
  ]

  const tenants = [
    { nome: 'Rastremix', leads: 142, promotores: 21 },
    { nome: 'Valeteck',  leads: 105, promotores: 17 },
  ]

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <span className="text-white text-2xl font-bold">{session.nome.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Olá, {session.nome}! 👋</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Logado como <span className="text-emerald-600 font-semibold">{getRoleLabel(session.role)}</span>
              {session.tenantNome && <> · Marca: <span className="text-blue-600 font-semibold">{session.tenantNome}</span></>}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">{session.email}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Visão Geral</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`bg-white border ${s.border} rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-500 text-sm">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.valueColor}`}>{s.value}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <svg className={`w-3.5 h-3.5 ${s.positive ? 'text-emerald-500' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.positive ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'} />
                    </svg>
                    <span className={`text-xs font-semibold ${s.positive ? 'text-emerald-600' : 'text-red-600'}`}>{s.change}</span>
                    <span className="text-slate-400 text-xs">vs. ontem</span>
                  </div>
                </div>
                <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center ${s.iconColor}`}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenants */}
      <div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Marcas Ativas</h3>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                {['Marca','Leads','Promotores','Status'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map(t => (
                <tr key={t.nome} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-white text-xs font-bold">{t.nome.charAt(0)}</span>
                      </div>
                      <span className="text-slate-800 font-semibold text-sm">{t.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 text-sm font-medium">{t.leads}</td>
                  <td className="px-6 py-4 text-slate-700 text-sm font-medium">{t.promotores}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/> Ativo
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
