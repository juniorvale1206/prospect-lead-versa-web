import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FinanceiroDashboard() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Dashboard Financeiro 💰</h2>
        <p className="text-gray-400 text-sm">Bem-vindo, <span className="text-blue-400">{session.nome}</span> — cargo: Financeiro</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{l:'Receita do Mês',v:'R$ 89.420',c:'text-emerald-400'},{l:'Comissões a Pagar',v:'R$ 14.820',c:'text-yellow-400'},{l:'Extratos Gerados',v:'127',c:'text-blue-400'}].map(s=>(
          <div key={s.l} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-400 text-sm">{s.l}</p>
            <p className={`text-2xl font-bold mt-1 ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-500 text-sm">📊 Gráficos e relatórios financeiros serão implementados aqui</p>
      </div>
    </div>
  )
}
