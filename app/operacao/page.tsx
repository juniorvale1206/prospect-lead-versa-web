import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function OperacaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Operação — Kanban 📋</h2>
        <p className="text-slate-500 text-sm">
          Bem-vindo, <span className="text-emerald-600 font-semibold">{session.nome}</span>
          {session.tenantNome && <> · Marca: <span className="text-blue-600 font-semibold">{session.tenantNome}</span></>}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { col: 'Novo Lead',        count: 12, bg: 'bg-blue-50',   border: 'border-blue-200',   head: 'text-blue-700'   },
          { col: 'Contato Feito',    count: 8,  bg: 'bg-amber-50',  border: 'border-amber-200',  head: 'text-amber-700'  },
          { col: 'Proposta Enviada', count: 5,  bg: 'bg-purple-50', border: 'border-purple-200', head: 'text-purple-700' },
          { col: 'Fechado',          count: 3,  bg: 'bg-emerald-50',border: 'border-emerald-200',head: 'text-emerald-700'},
        ].map(k => (
          <div key={k.col} className={`${k.bg} border ${k.border} rounded-2xl p-4 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold text-sm ${k.head}`}>{k.col}</h3>
              <span className={`text-xs font-black px-2 py-0.5 rounded-full bg-white border ${k.border} ${k.head}`}>{k.count}</span>
            </div>
            <div className="space-y-2">
              {Array.from({ length: Math.min(k.count, 3) }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                  <p className="text-slate-700 text-xs font-semibold">Lead #{i + 1}</p>
                  <p className="text-slate-400 text-xs mt-0.5">Empresa ABC Ltda</p>
                </div>
              ))}
              {k.count > 3 && <p className="text-slate-400 text-xs text-center py-1">+{k.count - 3} leads</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
