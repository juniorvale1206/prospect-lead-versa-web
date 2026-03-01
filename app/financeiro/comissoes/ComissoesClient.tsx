'use client'

import { useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type PayStatus = 'PENDENTE' | 'PAGO'

interface BenefEntry {
  id:         string
  nome:       string
  avatar:     string
  tenant:     string
  qtd:        number
  totalGerado: number
  comissao:   number
  status:     PayStatus
  breakdown:  { tipo: string; qtd: number; valor: number }[]
  telefone?:  string
  pix?:       string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_PROMOTORES: BenefEntry[] = [
  {
    id: 'p1', nome: 'Ana Silva', avatar: 'AS', tenant: 'Rastremix', telefone: '(31) 98800-1111', pix: '***58890-1111',
    qtd: 18, totalGerado: 36.00, comissao: 36.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Lead Ouro (foto aprovada)', qtd: 12, valor: 24.00 },
      { tipo: 'Lead Capturado', qtd: 6,  valor: 6.00 },
      { tipo: 'Reunião B2B agendada', qtd: 2, valor: 6.00 },
    ],
  },
  {
    id: 'p2', nome: 'João Costa', avatar: 'JC', tenant: 'Rastremix', telefone: '(31) 97711-2222', pix: '***58890-2222',
    qtd: 25, totalGerado: 53.00, comissao: 53.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Lead Ouro (foto aprovada)', qtd: 15, valor: 30.00 },
      { tipo: 'Lead Capturado', qtd: 10, valor: 10.00 },
      { tipo: 'Reunião B2B agendada', qtd: 4,  valor: 12.00 },
      { tipo: 'Venda Convertida (30%)', qtd: 1,  valor: 1.00 },
    ],
  },
  {
    id: 'p3', nome: 'Mariana Ramos', avatar: 'MR', tenant: 'Valeteck', telefone: '(11) 96622-3333', pix: '***58890-3333',
    qtd: 11, totalGerado: 22.00, comissao: 22.00, status: 'PAGO',
    breakdown: [
      { tipo: 'Lead Ouro (foto aprovada)', qtd: 7, valor: 14.00 },
      { tipo: 'Lead Capturado', qtd: 4, valor: 4.00 },
      { tipo: 'Reunião B2B agendada', qtd: 1, valor: 3.00 },
      { tipo: 'Ajuste manual', qtd: 1, valor: 1.00 },
    ],
  },
  {
    id: 'p4', nome: 'Lucas Ferreira', avatar: 'LF', tenant: 'Valeteck', telefone: '(11) 95533-4444', pix: '***58890-4444',
    qtd: 30, totalGerado: 67.00, comissao: 67.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Lead Ouro (foto aprovada)', qtd: 20, valor: 40.00 },
      { tipo: 'Lead Capturado', qtd: 10, valor: 10.00 },
      { tipo: 'Reunião B2B agendada', qtd: 5,  valor: 15.00 },
      { tipo: 'Bônus metas atingidas', qtd: 1,  valor: 2.00 },
    ],
  },
  {
    id: 'p5', nome: 'Carlos Promotor', avatar: 'CP', tenant: 'Rastremix', telefone: '(31) 98800-1234', pix: '***58890-5555',
    qtd: 7, totalGerado: 14.00, comissao: 14.00, status: 'PAGO',
    breakdown: [
      { tipo: 'Lead Ouro (foto aprovada)', qtd: 4, valor: 8.00 },
      { tipo: 'Lead Capturado', qtd: 3, valor: 3.00 },
      { tipo: 'Reunião B2B agendada', qtd: 1, valor: 3.00 },
    ],
  },
]

const MOCK_PDV: BenefEntry[] = [
  {
    id: 'v1', nome: 'Auto Peças Souza', avatar: 'AS', tenant: 'Rastremix', telefone: '(31) 3344-5500', pix: 'cnpj: 12.345.678/0001',
    qtd: 8, totalGerado: 3598.40, comissao: 359.84, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Rastreador Conect GPS Pro (R$450,00)', qtd: 4, valor: 180.00 },
      { tipo: 'Kit Câmera ADAS + DMS (R$1200,00)',    qtd: 2, valor: 120.00 },
      { tipo: 'Adesão Plano Rastremix Básico',         qtd: 2, valor: 59.84 },
    ],
  },
  {
    id: 'v2', nome: 'Moto Center BH', avatar: 'MC', tenant: 'Rastremix', telefone: '(31) 3221-7788', pix: 'pix@motocenter.com',
    qtd: 12, totalGerado: 1798.80, comissao: 539.64, status: 'PAGO',
    breakdown: [
      { tipo: 'Antifurto Partida Remota (R$299,90)', qtd: 6, valor: 269.82 },
      { tipo: 'Adesão Plano Rastremix Básico',        qtd: 6, valor: 269.82 },
    ],
  },
  {
    id: 'v3', nome: 'TechParts Valeteck', avatar: 'TV', tenant: 'Valeteck', telefone: '(11) 4003-2200', pix: 'cnpj: 98.765.432/0001',
    qtd: 5, totalGerado: 4450.00, comissao: 1335.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Sensor de Fadiga FatigueGuard (R$890)', qtd: 4, valor: 1068.00 },
      { tipo: 'Plano Valeteck Premium Anual (R$599)',   qtd: 1, valor: 267.00 },
    ],
  },
  {
    id: 'v4', nome: 'GPS Express - Joinville', avatar: 'GE', tenant: 'Gps Love', telefone: '(47) 3333-9900', pix: 'gps@express.com',
    qtd: 20, totalGerado: 2998.00, comissao: 899.40, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Plano Gps Love Motoboy (R$149,90)', qtd: 20, valor: 899.40 },
    ],
  },
]

const MOCK_BALCAO: BenefEntry[] = [
  {
    id: 'b1', nome: 'Beatriz Promotora', avatar: 'BP', tenant: 'Valeteck', telefone: '(11) 97700-5678', pix: '***97700-5678',
    qtd: 6, totalGerado: 5340.00, comissao: 1602.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Sensor de Fadiga FatigueGuard (30%)', qtd: 4, valor: 1068.00 },
      { tipo: 'Plano Valeteck Premium Anual (30%)',  qtd: 2, valor: 534.00 },
      { tipo: 'Comissão sobre adesão extra',          qtd: 1, valor: 0.00 },
    ],
  },
  {
    id: 'b2', nome: 'Diego Parceiro', avatar: 'DP', tenant: 'Gps Love', telefone: '(47) 96600-9999', pix: '***96600-9999',
    qtd: 14, totalGerado: 2098.60, comissao: 629.58, status: 'PAGO',
    breakdown: [
      { tipo: 'Plano Gps Love Motoboy (30%)', qtd: 14, valor: 629.58 },
    ],
  },
  {
    id: 'b3', nome: 'Fernanda Balcão', avatar: 'FB', tenant: 'Rastremix', telefone: '(31) 94455-7766', pix: '***94455-7766',
    qtd: 9, totalGerado: 3148.20, comissao: 944.46, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Rastreador Conect GPS Pro (30%)',    qtd: 5, valor: 675.00 },
      { tipo: 'Antifurto Partida Remota (30%)',     qtd: 4, valor: 269.46 },
    ],
  },
  {
    id: 'b4', nome: 'Ricardo Vendas', avatar: 'RV', tenant: 'Rastremix', telefone: '(31) 93366-8855', pix: '***93366-8855',
    qtd: 3, totalGerado: 3600.00, comissao: 1080.00, status: 'PENDENTE',
    breakdown: [
      { tipo: 'Kit Câmera ADAS + DMS (30%)', qtd: 3, valor: 1080.00 },
    ],
  },
]

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease] flex items-center gap-3
      bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl shadow-emerald-900/30 max-w-sm">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
      </svg>
      <p className="text-sm font-semibold">{msg}</p>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Modal Extrato ─────────────────────────────────────────────────────────────
function ModalExtrato({
  entry, tab, onClose, onLiquidar,
}: {
  entry:      BenefEntry
  tab:        number
  onClose:    () => void
  onLiquidar: () => void
}) {
  const tabLabels = ['Promotor de Rua', 'PDV / Loja Parceira', 'Funcionário Balcão']

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                <span className="text-white font-black text-lg">{entry.avatar}</span>
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-tight">{entry.nome}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-slate-300 text-xs">{tabLabels[tab]}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-500"/>
                  <span className="text-slate-300 text-xs">{entry.tenant}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Cards resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
              <p className="text-blue-400 text-xs font-medium mb-1">Qtd</p>
              <p className="text-blue-700 font-black text-xl">{entry.qtd}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
              <p className="text-slate-400 text-xs font-medium mb-1">Total Gerado</p>
              <p className="text-slate-700 font-black text-lg">R$ {entry.totalGerado.toFixed(2)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
              <p className="text-emerald-400 text-xs font-medium mb-1">A Receber</p>
              <p className="text-emerald-700 font-black text-xl">R$ {entry.comissao.toFixed(2)}</p>
            </div>
          </div>

          {/* Extrato detalhado */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Extrato Detalhado</p>
            <div className="space-y-1.5">
              {entry.breakdown.map((b, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">{b.qtd}</span>
                    <span className="text-slate-600 text-sm truncate">{b.tipo}</span>
                  </div>
                  <span className="text-emerald-700 font-bold text-sm flex-shrink-0 ml-3">
                    {b.valor > 0 ? `R$ ${b.valor.toFixed(2)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Dados de pagamento */}
          {(entry.pix || entry.telefone) && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex gap-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
              </svg>
              <div>
                {entry.pix && <p className="text-amber-800 text-xs font-semibold">PIX: {entry.pix}</p>}
                {entry.telefone && <p className="text-amber-700 text-xs mt-0.5">WhatsApp: {entry.telefone}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-50">
            Fechar
          </button>
          {entry.status === 'PENDENTE' && (
            <button onClick={onLiquidar}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl
                shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              Liquidar R$ {entry.comissao.toFixed(2)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Badge Status ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PayStatus }) {
  if (status === 'PAGO') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-none"/>Pago
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>Pendente
    </span>
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'from-violet-400 to-violet-600',
  'from-blue-400 to-blue-600',
  'from-emerald-400 to-emerald-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
  'from-cyan-400 to-cyan-600',
]
function Avatar({ initials, idx }: { initials: string; idx: number }) {
  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]
  return (
    <div className={`w-9 h-9 bg-gradient-to-br ${color} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white text-xs font-black">{initials}</span>
    </div>
  )
}

// ─── Tabela ────────────────────────────────────────────────────────────────────
function CommissionTable({
  data, tab, onViewEntry, onLiquidar,
}: {
  data:        BenefEntry[]
  tab:         number
  onViewEntry: (e: BenefEntry) => void
  onLiquidar:  (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDENTE' | 'PAGO'>('ALL')

  const filtered = data.filter(e => {
    const matchSearch = e.nome.toLowerCase().includes(search.toLowerCase()) ||
                        e.tenant.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'ALL' || e.status === filter
    return matchSearch && matchFilter
  })

  const totalPendente = data.filter(e => e.status === 'PENDENTE').reduce((s, e) => s + e.comissao, 0)
  const totalPago     = data.filter(e => e.status === 'PAGO').reduce((s, e) => s + e.comissao, 0)
  const totalGeral    = data.reduce((s, e) => s + e.comissao, 0)

  return (
    <div className="space-y-4">
      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Total a Pagar</p>
          <p className="text-slate-800 font-black text-2xl">R$ {totalGeral.toFixed(2)}</p>
          <p className="text-slate-400 text-xs mt-1">{data.length} beneficiários</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-amber-600 text-xs font-semibold uppercase tracking-wider mb-1">Pendente</p>
          <p className="text-amber-700 font-black text-2xl">R$ {totalPendente.toFixed(2)}</p>
          <p className="text-amber-500 text-xs mt-1">{data.filter(e => e.status === 'PENDENTE').length} aguardando</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
          <p className="text-emerald-600 text-xs font-semibold uppercase tracking-wider mb-1">Liquidado</p>
          <p className="text-emerald-700 font-black text-2xl">R$ {totalPago.toFixed(2)}</p>
          <p className="text-emerald-500 text-xs mt-1">{data.filter(e => e.status === 'PAGO').length} pagos</p>
        </div>
      </div>

      {/* Barra de busca e filtro */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou franquia..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"/>
        </div>
        {(['ALL', 'PENDENTE', 'PAGO'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              filter === f
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}>
            {f === 'ALL' ? 'Todos' : f === 'PENDENTE' ? 'Pendente' : 'Pago'}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Beneficiário</th>
              <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Qtd</th>
              <th className="text-right px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Valor Gerado</th>
              <th className="text-right px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Comissão</th>
              <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">Nenhum registro encontrado.</td></tr>
            )}
            {filtered.map((e, i) => (
              <tr key={e.id}
                className="hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onViewEntry(e)}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar initials={e.avatar} idx={i}/>
                    <div className="min-w-0">
                      <p className="text-slate-800 font-semibold text-sm truncate">{e.nome}</p>
                      <p className="text-slate-400 text-xs">{e.tenant}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-slate-700 font-bold text-sm">{e.qtd}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-slate-600 text-sm">R$ {e.totalGerado.toFixed(2)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`font-bold text-sm ${e.status === 'PAGO' ? 'text-emerald-600' : 'text-slate-800'}`}>
                    R$ {e.comissao.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <StatusBadge status={e.status}/>
                </td>
                <td className="px-4 py-4 text-center" onClick={ev => ev.stopPropagation()}>
                  {e.status === 'PENDENTE' ? (
                    <button
                      onClick={() => onLiquidar(e.id)}
                      className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg
                        shadow-sm shadow-emerald-200 transition-all active:scale-95 whitespace-nowrap">
                      Liquidar
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="text-slate-400 text-xs text-right">{filtered.length} registro(s) exibido(s)</p>
      )}
    </div>
  )
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function ComissoesClientPage() {
  const [activeTab, setActiveTab]     = useState(0)
  const [selectedEntry, setSelected]  = useState<BenefEntry | null>(null)
  const [toast, setToast]             = useState<string | null>(null)
  const [promotores, setPromotores]   = useState(MOCK_PROMOTORES)
  const [pdvs, setPdvs]               = useState(MOCK_PDV)
  const [balcao, setBalcao]           = useState(MOCK_BALCAO)

  const tabs = [
    { label: 'Promotores de Rua', icon: '🧑‍💼', data: promotores, setter: setPromotores, pendentes: promotores.filter(e => e.status === 'PENDENTE').length },
    { label: 'Lojas Parceiras — PDV', icon: '🏪', data: pdvs, setter: setPdvs, pendentes: pdvs.filter(e => e.status === 'PENDENTE').length },
    { label: 'Funcionários — Balcão', icon: '🧾', data: balcao, setter: setBalcao, pendentes: balcao.filter(e => e.status === 'PENDENTE').length },
  ]

  function handleLiquidar(id: string) {
    const tab = tabs[activeTab]
    tab.setter((prev: BenefEntry[]) =>
      prev.map(e => e.id === id ? { ...e, status: 'PAGO' as PayStatus } : e)
    )
    setSelected(null)
    setToast('Pagamento liquidado com sucesso!')
    setTimeout(() => setToast(null), 4000)
  }

  const currentData = tabs[activeTab].data

  const totalGeralSistema = [...promotores, ...pdvs, ...balcao].reduce((s, e) => s + e.comissao, 0)
  const totalPendenteSistema = [...promotores, ...pdvs, ...balcao].filter(e => e.status === 'PENDENTE').reduce((s, e) => s + e.comissao, 0)

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">Comissões e Fechamento</h1>
                <p className="text-slate-500 text-sm">Controle de pagamentos por tipo de beneficiário</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-slate-500 text-xs font-medium">Saldo pendente total:</span>
              <span className="text-amber-600 font-black text-sm">R$ {totalPendenteSistema.toFixed(2)}</span>
            </div>
            <p className="text-slate-400 text-xs pr-1">Total geral: R$ {totalGeralSistema.toFixed(2)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100">
            {tabs.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)}
                className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === i
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <span className="text-base">{t.icon}</span>
                <span>{t.label}</span>
                {t.pendentes > 0 && (
                  <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${
                    activeTab === i ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {t.pendentes}
                  </span>
                )}
                {activeTab === i && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"/>
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            <CommissionTable
              key={activeTab}
              data={currentData}
              tab={activeTab}
              onViewEntry={setSelected}
              onLiquidar={handleLiquidar}
            />
          </div>
        </div>
      </div>

      {/* Modal extrato */}
      {selectedEntry && (
        <ModalExtrato
          entry={selectedEntry}
          tab={activeTab}
          onClose={() => setSelected(null)}
          onLiquidar={() => handleLiquidar(selectedEntry.id)}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)}/>}
    </div>
  )
}
