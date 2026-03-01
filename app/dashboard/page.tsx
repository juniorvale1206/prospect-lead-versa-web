import { redirect } from 'next/navigation'
import { getSession, getRoleLabel } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const stats = [
    {
      label: 'Leads Hoje',
      value: '247',
      change: '+18%',
      positive: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'from-emerald-500 to-emerald-600',
      bg: 'bg-emerald-500/10',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Comissões Pendentes',
      value: 'R$ 14.820',
      change: '+5%',
      positive: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-blue-500 to-blue-600',
      bg: 'bg-blue-500/10',
      textColor: 'text-blue-400',
    },
    {
      label: 'Promotores Ativos',
      value: '38',
      change: '-2',
      positive: false,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      color: 'from-purple-500 to-purple-600',
      bg: 'bg-purple-500/10',
      textColor: 'text-purple-400',
    },
  ]

  const tenants = [
    { nome: 'Rastremix', leads: 142, promotores: 21, status: 'Ativo' },
    { nome: 'Valeteck', leads: 105, promotores: 17, status: 'Ativo' },
  ]

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-white text-2xl font-bold">
              {session.nome.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              Olá, {session.nome}! 👋
            </h2>
            <p className="text-gray-400 text-sm">
              Logado como{' '}
              <span className="text-emerald-400 font-medium">
                {getRoleLabel(session.role)}
              </span>
              {session.tenantNome && (
                <> · Marca: <span className="text-blue-400 font-medium">{session.tenantNome}</span></>
              )}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">{session.email}</p>
          </div>
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div>
        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">Visão Geral</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{stat.label}</p>
                  <p className="text-white text-2xl font-bold mt-1">{stat.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <svg
                      className={`w-4 h-4 ${stat.positive ? 'text-emerald-400' : 'text-red-400'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={stat.positive ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'}
                      />
                    </svg>
                    <span
                      className={`text-sm font-medium ${stat.positive ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {stat.change}
                    </span>
                    <span className="text-gray-500 text-xs">vs. ontem</span>
                  </div>
                </div>
                <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center ${stat.textColor}`}>
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Marcas (Tenants) */}
      <div>
        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">Marcas Ativas</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Marca</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Leads</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Promotores</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant, i) => (
                <tr key={tenant.nome} className={i < tenants.length - 1 ? 'border-b border-gray-800' : ''}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{tenant.nome.charAt(0)}</span>
                      </div>
                      <span className="text-white font-medium">{tenant.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-300">{tenant.leads}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-300">{tenant.promotores}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {tenant.status}
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
