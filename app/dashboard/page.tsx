import { redirect }        from 'next/navigation'
import { getSession, getRoleLabel } from '@/lib/auth'
import DashboardClient      from './DashboardClient'

export const metadata = {
  title: 'Dashboard Global — ProspecLead',
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isAdmin = session.role === 'ADMIN_MASTER' || session.role === 'FINANCIAL'

  return (
    <div className="space-y-6">

      {/* ── Boas-vindas ── */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="text-white text-2xl font-bold">
                {session.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Olá, {session.nome}! 👋
              </h2>
              <p className="text-slate-500 text-sm mt-0.5">
                Logado como{' '}
                <span className="text-indigo-600 font-semibold">{getRoleLabel(session.role)}</span>
                {session.tenantNome && (
                  <> · Marca:{' '}
                    <span className="text-blue-600 font-semibold">{session.tenantNome}</span>
                  </>
                )}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{session.email}</p>
            </div>
          </div>

          {/* Badge de nível */}
          <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${
            session.role === 'ADMIN_MASTER'
              ? 'bg-purple-100 border-purple-200 text-purple-700'
              : session.role === 'FINANCIAL'
              ? 'bg-green-100 border-green-200 text-green-700'
              : 'bg-blue-100 border-blue-200 text-blue-700'
          }`}>
            {getRoleLabel(session.role)}
          </div>
        </div>
      </div>

      {/* ── Dashboard Global (apenas ADMIN_MASTER e FINANCIAL) ── */}
      {isAdmin ? (
        <DashboardClient/>
      ) : (
        /* Usuários com outros papéis veem um resumo simplificado */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h3 className="font-bold text-slate-800 text-lg">Bem-vindo ao ProspecLead</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            Use o menu lateral para acessar as ferramentas disponíveis para o seu nível de acesso.
          </p>
        </div>
      )}
    </div>
  )
}
