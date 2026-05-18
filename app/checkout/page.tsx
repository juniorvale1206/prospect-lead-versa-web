'use client'

/**
 * Checkout ProspecLead — layout fiel à imagem de referência Quantum
 *
 * Estrutura:
 *   Header  → logo + "Dúvidas? Acessar suporte"
 *   Body    → col-esq (Escolha plano + Pagar com) | col-dir (Detalhes do plano)
 *
 * Lado esquerdo:
 *   • Escolha seu plano  — radio Mensal / Anual (badge "Economize 22%")
 *   • Pagar com          — [Cartão] [PIX / Conta] [···]
 *   • Busca de banco     — grid 3×2 com logos
 *
 * Lado direito (card fixo):
 *   • Nome do plano + subtítulo
 *   • Preço em destaque
 *   • Estão inclusos — checklist
 *   • Total devido hoje
 *   • Botão "Confirmar e assinar"
 */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── tipos ────────────────────────────────────────────────────────────────
type PlanId   = 'rastremix' | 'gpsmy' | 'topypro'
type Interval = 'month' | 'year'
type Method   = 'card' | 'pix' | 'boleto'

interface VapecPlan {
  id: PlanId
  name: string
  subtitle: string
  monthlyPrice: number
  annualPrice:  number
  savingPct:    number
  features:     string[]
  recommended?: boolean
}

// ─── planos VAPEC 2026 v1.4 ───────────────────────────────────────────────
const PLANS: VapecPlan[] = [
  {
    id: 'rastremix',
    name: 'Rastremix',
    subtitle: 'Até 50 veículos',
    monthlyPrice: 200,
    annualPrice:  1872,
    savingPct:    22,
    features: [
      'Rastreamento em tempo real',
      'Histórico de 90 dias',
      'App para motorista incluído',
      'Cercas virtuais ilimitadas',
    ],
  },
  {
    id: 'gpsmy',
    name: 'GPS My',
    subtitle: 'Até 200 veículos',
    monthlyPrice: 250,
    annualPrice:  2340,
    savingPct:    22,
    features: [
      'Tudo do Rastremix',
      'Histórico de 180 dias',
      'Sensor de fadiga (DMS)',
      'Identificação de motorista',
      'Relatórios gerenciais',
      'Dashboard web completo',
    ],
    recommended: true,
  },
  {
    id: 'topypro',
    name: 'Topy Pro',
    subtitle: 'Frotas ilimitadas',
    monthlyPrice: 300,
    annualPrice:  2808,
    savingPct:    22,
    features: [
      'Tudo do GPS My',
      'Câmera ADAS + DMS 360°',
      'Bloqueio de partida remoto',
      'Cercas elétricas industriais',
      'Videotelemetria HD',
      'Suporte prioritário 24/7',
    ],
  },
]

// logos dos "bancos" — aqui representam integrações/gateways BR
const BANK_LOGOS = [
  { id: 'asaas',    label: 'Asaas'      },
  { id: 'mercado',  label: 'Mercado Pago'},
  { id: 'pagseg',   label: 'PagSeguro'  },
  { id: 'cielo',    label: 'Cielo'      },
  { id: 'stone',    label: 'Stone'      },
  { id: 'safra',    label: 'Banco Safra'},
]

// ─── helpers ──────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── ícones inline ────────────────────────────────────────────────────────
function IconCard() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}
function IconBank() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11" />
    </svg>
  )
}
function IconPix() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.3 2.4a1 1 0 0 1 1.4 0l2.6 2.6 3.3-1.1a1 1 0 0 1 1.3 1L20 8.2l2.6 2.6a1 1 0 0 1 0 1.4L20 14.8l.1 3.3a1 1 0 0 1-1.3 1L15.4 18l-2.7 2.6a1 1 0 0 1-1.4 0L8.6 18l-3.3 1.1a1 1 0 0 1-1.3-1L4 14.8l-2.6-2.6a1 1 0 0 1 0-1.4L4 8.2 3.9 4.9a1 1 0 0 1 1.3-1L8.6 5l2.7-2.6z"/>
    </svg>
  )
}
function IconDots() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function IconCheck({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// ─── Radio pill ───────────────────────────────────────────────────────────
function RadioPill({
  checked, onClick, children,
}: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left
        ${checked
          ? 'border-violet-600 bg-violet-50'
          : 'border-slate-200 bg-white hover:border-violet-300'
        }`}
    >
      {/* radio circle */}
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
        ${checked ? 'border-violet-600 bg-violet-600' : 'border-slate-300 bg-white'}`}>
        {checked && <span className="w-2 h-2 rounded-full bg-white block" />}
      </span>
      {children}
    </button>
  )
}

// ─── Método de pagamento tab ──────────────────────────────────────────────
function PayTab({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all text-sm font-medium
        ${active
          ? 'border-violet-600 bg-violet-50 text-violet-700'
          : 'border-slate-200 text-slate-600 hover:border-violet-300'
        }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ─── conteúdo principal ───────────────────────────────────────────────────
function CheckoutContent() {
  const searchParams   = useSearchParams()
  const initPlan       = (searchParams.get('plan') as PlanId) ?? 'gpsmy'
  const initOrderId    = searchParams.get('orderId') ?? ''

  const [plan,        setPlan]        = useState<PlanId>(initPlan)
  const [interval,    setInterval]    = useState<Interval>('year')
  const [method,      setMethod]      = useState<Method>('card')
  const [bankSearch,  setBankSearch]  = useState('')
  const [installments,setInstallments]= useState(1)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [client, setClient] = useState({ name: '', email: '', cpf: '' })

  const currentPlan = PLANS.find(p => p.id === plan) ?? PLANS[1]
  const price       = interval === 'year' ? currentPlan.annualPrice : currentPlan.monthlyPrice
  const monthlyEq   = interval === 'year' ? (currentPlan.annualPrice / 12) : currentPlan.monthlyPrice

  // taxa estimada
  const TAX: Record<Method, number> = { pix: 0.0099, boleto: 0.0199, card: installments > 1 ? 0.0299 + (installments - 1) * 0.0099 : 0.0249 }
  const taxAmt   = Math.round(price * TAX[method] * 100) / 100
  const netValue = price - taxAmt

  const filteredBanks = BANK_LOGOS.filter(b =>
    b.label.toLowerCase().includes(bankSearch.toLowerCase())
  )

  const handleSubmit = useCallback(async () => {
    if (!client.name || !client.email || !client.cpf) {
      setError('Preencha nome, e-mail e CPF/CNPJ para continuar.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/pagamentos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: `${plan}_mensal`,
          interval,
          paymentMethod: method,
          customerName: client.name,
          customerEmail: client.email,
          customerCpf: client.cpf,
          orderId: initOrderId || undefined,
          installments: method === 'card' ? installments : 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.configRequired) {
          setError('Stripe não configurado. Vá em Configurações → Integrações para adicionar as chaves.')
          return
        }
        setError(data.error ?? 'Erro ao iniciar pagamento')
        return
      }
      if (data.url) window.location.href = data.url
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [client, plan, interval, method, installments, initOrderId])

  const canSubmit = client.name && client.email && client.cpf && !loading

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-lg overflow-hidden">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-800">ProspecLead</span>
          </div>
          <p className="text-sm text-slate-500">
            Dúvidas?{' '}
            <a href="/admin" className="text-violet-600 font-medium hover:underline">
              Acessar bate-papo
            </a>
          </p>
        </header>

        {/* ── BODY — 2 colunas ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px]">

          {/* ══ COLUNA ESQUERDA ══════════════════════════════════════════ */}
          <div className="px-8 py-8 space-y-8 border-r border-slate-100">

            {/* Escolha seu plano */}
            <section>
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Escolha seu plano</h2>

              <RadioPill checked={interval === 'month'} onClick={() => setInterval('month')}>
                <span className="text-sm font-medium text-slate-700">Assinatura mensal</span>
              </RadioPill>

              <div className="mt-2">
                <RadioPill checked={interval === 'year'} onClick={() => setInterval('year')}>
                  <span className="text-sm font-medium text-slate-700 flex-1">Assinatura anual</span>
                  <span className="text-[11px] font-semibold bg-violet-100 text-violet-700 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    Economize {currentPlan.savingPct}%
                  </span>
                </RadioPill>
              </div>

              {/* Mini seletor de plano (quando mensal) */}
              {interval === 'month' && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PLANS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPlan(p.id)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all
                        ${plan === p.id
                          ? 'border-violet-600 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-600 hover:border-violet-300'
                        }`}
                    >
                      {p.name}
                      {p.recommended && <span className="block text-[10px] text-violet-500">Recomendado</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Dados do assinante */}
            <section>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Dados do assinante</h2>
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Nome completo / Razão Social"
                  value={client.name}
                  onChange={e => setClient(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  type="email"
                  placeholder="E-mail"
                  value={client.email}
                  onChange={e => setClient(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  type="text"
                  placeholder="CPF ou CNPJ (apenas números)"
                  value={client.cpf}
                  onChange={e => setClient(p => ({ ...p, cpf: e.target.value.replace(/\D/g, '') }))}
                  maxLength={14}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </section>

            {/* Pagar com */}
            <section>
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Pagar com</h2>

              {/* Tabs de método */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <PayTab
                  active={method === 'card'}
                  onClick={() => setMethod('card')}
                  icon={<IconCard />}
                  label="Cartão"
                />
                <PayTab
                  active={method === 'pix'}
                  onClick={() => setMethod('pix')}
                  icon={<IconBank />}
                  label="PIX / Banco"
                />
                <button
                  type="button"
                  onClick={() => setMethod('boleto')}
                  className={`flex items-center gap-1.5 px-3 py-3 rounded-xl border transition-all text-slate-500
                    ${method === 'boleto' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <IconDots />
                </button>
              </div>

              {/* Parcelamento (cartão) */}
              {method === 'card' && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">Parcelamento</label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value={1}>À vista — {fmtBRL(price)} (taxa 2,49%)</option>
                    {[2,3,4,6,12].map(n => (
                      <option key={n} value={n}>
                        {n}x de {fmtBRL(price / n)} (taxa {(2.99 + (n-1)*0.99).toFixed(2)}%)
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5 mt-2">
                    {['Visa','Master','Amex','Elo','Hiper'].map(b => (
                      <span key={b} className="px-2 py-1 bg-slate-100 rounded text-[11px] text-slate-500 font-medium">{b}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Infos PIX */}
              {method === 'pix' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4 text-sm text-blue-800">
                  <p className="font-semibold">🔵 PIX — Aprovação instantânea</p>
                  <p className="text-xs text-blue-600 mt-0.5">QR Code gerado pelo Stripe · Expira em 30 min · Taxa: 0,99%</p>
                </div>
              )}

              {/* Boleto */}
              {method === 'boleto' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-sm text-amber-800">
                  <p className="font-semibold">🏦 Boleto Bancário</p>
                  <p className="text-xs text-amber-700 mt-0.5">Vencimento em 3 dias · Ativação após confirmação · Taxa: 1,99%</p>
                </div>
              )}

              {/* Campo de busca (para PIX/Banco) */}
              {method === 'pix' && (
                <>
                  <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2"><IconSearch /></span>
                    <input
                      type="text"
                      placeholder="Pesquise seu banco"
                      value={bankSearch}
                      onChange={e => setBankSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {/* Grid de logos 3×2 */}
                  <div className="grid grid-cols-3 gap-3">
                    {filteredBanks.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        className="flex items-center justify-center h-14 rounded-xl border border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50 transition-all"
                      >
                        <span className="text-xs font-bold text-slate-700 tracking-tight">{b.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Erro */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}
          </div>

          {/* ══ COLUNA DIREITA — Detalhes do plano ══════════════════════ */}
          <div className="px-7 py-8 bg-slate-50 flex flex-col">
            <h2 className="text-sm font-semibold text-slate-500 mb-5">Detalhes do plano</h2>

            {/* Card de detalhes */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex-1">

              {/* Nome e subtítulo */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">{currentPlan.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{currentPlan.subtitle}</p>
              </div>

              {/* Preço */}
              <div className="mb-1">
                <span className="text-4xl font-extrabold text-slate-900">
                  {fmtBRL(price)}
                </span>
                <span className="text-sm text-slate-400 ml-1">
                  /{interval === 'year' ? 'ano' : 'mês'}
                </span>
              </div>
              {interval === 'year' && (
                <p className="text-xs text-emerald-600 font-medium mb-4">
                  ≈ {fmtBRL(monthlyEq)}/mês — Economize {currentPlan.savingPct}%
                </p>
              )}

              {/* Divisor */}
              <hr className="border-slate-100 my-4" />

              {/* Features */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-500 mb-3">Estão inclusos:</p>
                <ul className="space-y-2.5">
                  {currentPlan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <IconCheck className="text-violet-600 mt-0.5" />
                      <span className="text-sm text-slate-600">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Total */}
              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Total devido hoje (BRL)</span>
                <span className="text-sm font-bold text-slate-800">{fmtBRL(price)}</span>
              </div>
            </div>

            {/* Botão confirmar */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`mt-5 w-full py-4 rounded-xl font-bold text-base transition-all
                ${canSubmit
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:shadow-violet-200'
                  : 'bg-violet-200 text-violet-400 cursor-not-allowed'
                }`}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Processando...
                  </span>
                : 'Confirmar e assinar'
              }
            </button>

            {/* Segurança */}
            <p className="text-center text-[11px] text-slate-400 mt-3 leading-5">
              🔒 Pagamento seguro via Stripe · PCI-DSS Nível 1
              <br/>
              <a href="#" className="text-violet-500 hover:underline">Termos</a>
              {' · '}
              <a href="#" className="text-violet-500 hover:underline">Privacidade</a>
            </p>
          </div>

        </div>{/* end grid */}
      </div>
    </div>
  )
}

// ─── wrapper com Suspense (necessário para useSearchParams) ───────────────
export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
