'use client'

/**
 * /promotor/comissoes — Extrato de comissões do promotor
 */

import { useState, useEffect } from 'react'

interface CommissionEntry {
  id: string
  netValue: number
  grossValue: number
  status: string
  description?: string
  motorType?: string
  createdAt: string
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-50'   },
  PAID:    { label: 'Pago',     color: 'text-emerald-700', bg: 'bg-emerald-50' },
  BLOCKED: { label: 'Bloqueado',color: 'text-red-700',   bg: 'bg-red-50'    },
  GLOSS:   { label: 'Glosado',  color: 'text-slate-700', bg: 'bg-slate-100'  },
}

export default function MinhasComissoesPage() {
  const [entries, setEntries] = useState<CommissionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/promotor/stats`)
        const d   = await res.json()
        // Stats traz pending + paid
        // Para extrato completo precisaria de /api/promotor/comissoes
        // Por ora exibimos resumo e placeholder
        setLoading(false)
      } catch { setLoading(false) }
    }
    fetchEntries()
  }, [page])

  // Carregar entradas de comissão
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/promotor/comissoes?page=${page}&limit=20`)
        if (res.ok) {
          const d = await res.json()
          setEntries(d.entries ?? [])
          setTotal(d.total ?? 0)
        }
      } catch { /* ignorar */ }
      finally { setLoading(false) }
    }
    load()
  }, [page])

  const totalPending = entries.filter(e => e.status === 'PENDING').reduce((s,e) => s + e.netValue, 0)
  const totalPaid    = entries.filter(e => e.status === 'PAID').reduce((s,e) => s + e.netValue, 0)
  const pages        = Math.ceil(total / 20)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Minhas Comissões</h1>
        <p className="text-slate-500 text-sm mt-0.5">Extrato de comissões por motorista</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Total Entradas</p>
          <p className="text-3xl font-bold text-slate-800">{total}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">A Receber</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalPending)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">Total Recebido</p>
          <p className="text-2xl font-bold text-emerald-700">{fmt(totalPaid)}</p>
        </div>
      </div>

      {/* Informativo sobre motores */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-bold text-slate-800 mb-4">Como são calculadas suas comissões</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { motor: 'Motor 1', desc: 'Comissão por venda direta', color: 'blue'   },
            { motor: 'Motor 2', desc: 'Bônus de ativação mensal',  color: 'purple' },
            { motor: 'Motor 3', desc: 'Recorrência / Carreira',    color: 'emerald'},
            { motor: 'Motor 4', desc: 'Compliance e penalidades',  color: 'amber'  },
          ].map(m => (
            <div key={m.motor} className={`flex items-start gap-3 p-3 rounded-xl bg-${m.color}-50 border border-${m.color}-100`}>
              <div className={`w-8 h-8 rounded-xl bg-${m.color}-100 flex items-center justify-center flex-shrink-0`}>
                <span className={`text-xs font-bold text-${m.color}-700`}>{m.motor.slice(-1)}</span>
              </div>
              <div>
                <p className={`text-sm font-bold text-${m.color}-700`}>{m.motor}</p>
                <p className="text-xs text-slate-500">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extrato */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Extrato detalhado</h2>
        </div>
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <svg className="w-6 h-6 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Carregando...
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <p className="font-medium">Nenhuma entrada de comissão ainda.</p>
            <p className="text-sm mt-1">As comissões são calculadas após o fechamento de vendas.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Motor','Descrição','Bruto','Líquido','Status','Data'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(e => {
                const s = STATUS_META[e.status] ?? STATUS_META.PENDING
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {e.motorType ?? 'M1'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{e.description ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmt(e.grossValue)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{fmt(e.netValue)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(e.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
