'use client'

/**
 * /promotor/vendas — Histórico de vendas do promotor
 */

import { useState, useEffect, useCallback } from 'react'

interface Sale {
  id: string
  totalAmount: number
  commissionAmount: number
  paymentMethod: string
  installments: number
  createdAt: string
  lead?: { nomeCliente: string; placa: string; veiculo: string }
  product?: { name: string }
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const PM_LABELS: Record<string, string> = {
  PIX: 'PIX', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto', DINHEIRO: 'Dinheiro',
}

export default function MinhasVendasPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // KPIs
  const totalRevenue    = sales.reduce((s, v) => s + v.totalAmount,    0)
  const totalCommission = sales.reduce((s, v) => s + v.commissionAmount, 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/promotor/stats`)
      const data = await res.json()
      // Buscar vendas via kanban ou sales API
      // Por ora mostramos os dados de stats
      setLoading(false)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Carregar vendas diretamente
  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        // Usa API genérica filtrada por promoter (kanban/sales)
        const res = await fetch(`/api/kanban/sales?${params}`)
        if (res.ok) {
          const d = await res.json()
          setSales(d.sales ?? [])
          setTotal(d.total ?? 0)
        }
      } catch { /* ignorar */ }
      finally { setLoading(false) }
    }
    fetchSales()
  }, [page])

  const pages = Math.ceil(total / 20)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Minhas Vendas</h1>
        <p className="text-slate-500 text-sm mt-0.5">{total} vendas registradas</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Total de Vendas</p>
          <p className="text-3xl font-bold text-slate-800">{total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Receita Gerada</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 shadow-sm text-white">
          <p className="text-xs text-emerald-100 font-semibold uppercase tracking-wide mb-1">Comissões</p>
          <p className="text-2xl font-bold">{fmt(totalCommission)}</p>
        </div>
      </div>

      {/* Lista de vendas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <svg className="w-6 h-6 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Carregando vendas...
          </div>
        ) : sales.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <p className="text-slate-500 font-medium">Nenhuma venda registrada ainda</p>
            <p className="text-slate-400 text-sm">As vendas são registradas pelo app mobile ProspecLead</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Cliente','Produto','Valor','Comissão','Pagamento','Data'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800">{s.lead?.nomeCliente ?? '—'}</p>
                      {s.lead?.placa && <p className="text-xs font-mono text-slate-400">{s.lead.placa}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.product?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">{fmt(s.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{fmt(s.commissionAmount)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                        {PM_LABELS[s.paymentMethod] ?? s.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Página {page} de {pages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <button onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
