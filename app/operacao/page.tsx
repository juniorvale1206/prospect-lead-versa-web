import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function OperacaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <div className="space-y-6">
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Operação (Kanban) 📋</h2>
        <p className="text-gray-400 text-sm">Bem-vindo, <span className="text-emerald-400">{session.nome}</span>{session.tenantNome && <> — Marca: <span className="text-blue-400">{session.tenantNome}</span></>}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[{col:'Novo Lead',count:12,color:'bg-blue-500/20 border-blue-500/30'},{col:'Contato Feito',count:8,color:'bg-yellow-500/20 border-yellow-500/30'},{col:'Proposta Enviada',count:5,color:'bg-purple-500/20 border-purple-500/30'},{col:'Fechado',count:3,color:'bg-emerald-500/20 border-emerald-500/30'}].map(k=>(
          <div key={k.col} className={`bg-gray-900 border ${k.color} rounded-2xl p-4`}>
            <h3 className="text-white font-semibold text-sm mb-3">{k.col}</h3>
            <div className="space-y-2">
              {Array.from({length: Math.min(k.count, 3)}).map((_,i)=>(
                <div key={i} className="bg-gray-800 rounded-xl p-3">
                  <p className="text-white text-xs font-medium">Lead #{i+1}</p>
                  <p className="text-gray-400 text-xs mt-0.5">Empresa ABC Ltda</p>
                </div>
              ))}
              {k.count > 3 && <p className="text-gray-500 text-xs text-center">+{k.count - 3} leads</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
