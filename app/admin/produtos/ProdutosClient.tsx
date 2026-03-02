'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Tenant {
  id: string
  nome: string
  slug: string
}

// Ciclos de cobrança disponíveis (com multiplicador para cálculo automático)
const CYCLE_OPTIONS = [
  { value: 'QUARTERLY',     label: 'Trimestral', icon: '🗓️', desc: 'A cada 3 meses',  months: 3  },
  { value: 'SEMI_ANNUALLY', label: 'Semestral',  icon: '📅', desc: 'A cada 6 meses',  months: 6  },
  { value: 'ANNUALLY',      label: 'Anual',      icon: '📆', desc: 'A cada 12 meses', months: 12 },
] as const
type BillingCycle = typeof CYCLE_OPTIONS[number]['value']

interface Product {
  id: string
  name: string
  type: 'HARDWARE' | 'SUBSCRIPTION_PLAN'
  description: string | null
  price: number
  commissionPercentage: number
  setupFee: number
  billingCycles: string[]
  allowCreditCardInstallments: boolean
  maxInstallments: number
  /** Valor base mensal da assinatura de plataforma (só HARDWARE). Default: 0 */
  monthlySubscriptionPrice: number
  isActive: boolean
  tenantId: string | null
  tenant: Tenant | null
  createdAt: string
  updatedAt: string
}

type FilterStatus = 'all' | 'active' | 'inactive'
type FilterType   = 'all' | 'HARDWARE' | 'SUBSCRIPTION_PLAN'

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  HARDWARE:          { label: 'Hardware',        icon: '📡', color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  SUBSCRIPTION_PLAN: { label: 'Plano / Adesão',  icon: '📋', color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function commissionValue(price: number, pct: number) {
  return (price * pct) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ msg, tipo, onHide }: { msg: string; tipo: 'success' | 'error'; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 4000)
    return () => clearTimeout(t)
  }, [onHide])

  return (
    <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border max-w-sm animate-slide-in
      ${tipo === 'success' ? 'bg-white border-emerald-200 shadow-emerald-100' : 'bg-white border-red-200 shadow-red-100'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
        ${tipo === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
        {tipo === 'success'
          ? <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
          : <svg className="w-5 h-5 text-red-500"     fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
        }
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${tipo === 'success' ? 'text-emerald-800' : 'text-red-700'}`}>
          {tipo === 'success' ? 'Operação realizada!' : 'Erro na operação'}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">{msg}</p>
      </div>
      <button onClick={onHide} className="text-slate-300 hover:text-slate-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE DE TIPO
// ─────────────────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_LABELS[type] ?? { label: type, icon: '📦', color: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL PRODUTO (criar / editar)
// ─────────────────────────────────────────────────────────────────────────────
interface ModalProdutoProps {
  product: Product | null          // null = criar novo
  tenants: Tenant[]
  onClose: () => void
  onSaved: (p: Product, isNew: boolean) => void
}

function ModalProduto({ product, tenants, onClose, onSaved }: ModalProdutoProps) {
  const isEdit = !!product

  const [form, setForm] = useState({
    name:                        product?.name                        ?? '',
    type:                        (product?.type                       ?? 'HARDWARE') as 'HARDWARE' | 'SUBSCRIPTION_PLAN',
    description:                 product?.description                 ?? '',
    price:                       product?.price                       ?? 0,
    commissionPercentage:        product?.commissionPercentage        ?? 30,
    tenantId:                    product?.tenantId                    ?? '',
    isActive:                    product?.isActive                    ?? true,
    // Campos específicos por tipo
    setupFee:                    product?.setupFee                    ?? 0,
    billingCycles:               (product?.billingCycles?.length
                                    ? product.billingCycles
                                    : ['QUARTERLY']) as BillingCycle[],
    allowCreditCardInstallments: product?.allowCreditCardInstallments ?? false,
    maxInstallments:             product?.maxInstallments             ?? 1,
    // Assinatura mensal vinculada ao hardware
    monthlySubscriptionPrice:    product?.monthlySubscriptionPrice    ?? 0,
  })
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const isSubscription = form.type === 'SUBSCRIPTION_PLAN'
  const isHardware     = form.type === 'HARDWARE'

  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, loading])

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  // Toggle de ciclo de cobrança para HARDWARE
  function toggleCycle(cycle: BillingCycle) {
    setForm(f => {
      const has  = f.billingCycles.includes(cycle)
      const next = has
        ? f.billingCycles.filter(c => c !== cycle)
        : [...f.billingCycles, cycle]
      return { ...f, billingCycles: next }
    })
    setErrors(e => { const n = { ...e }; delete n.billingCycles; return n })
  }

  // Ao trocar o tipo, reseta campos específicos
  function handleTypeChange(t: 'HARDWARE' | 'SUBSCRIPTION_PLAN') {
    setForm(f => ({
      ...f,
      type: t,
      // Reset condicionais — cast explícito para BillingCycle[] para satisfazer o TypeScript
      setupFee:                 t === 'SUBSCRIPTION_PLAN' ? f.setupFee : 0,
      monthlySubscriptionPrice: t === 'HARDWARE' ? f.monthlySubscriptionPrice : 0,
      billingCycles: (t === 'HARDWARE'
        ? (f.billingCycles.length ? f.billingCycles : ['QUARTERLY' as BillingCycle])
        : [] as BillingCycle[]),
    }))
    setErrors({})
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.name.trim())
      errs.name = 'Nome é obrigatório'
    if (form.price < 0)
      errs.price = 'Preço não pode ser negativo'
    if (form.commissionPercentage < 0 || form.commissionPercentage > 100)
      errs.commissionPercentage = 'Comissão deve ser entre 0% e 100%'
    // SUBSCRIPTION_PLAN: setupFee obrigatório
    if (isSubscription && (form.setupFee === undefined || form.setupFee === null || isNaN(form.setupFee)))
      errs.setupFee = 'Valor de instalação/adesão é obrigatório'
    // HARDWARE: ao menos 1 ciclo selecionado
    if (isHardware && form.billingCycles.length === 0)
      errs.billingCycles = 'Selecione ao menos um ciclo de assinatura obrigatória'
    // HARDWARE: valor mensal obrigatório quando algum ciclo está selecionado
    if (isHardware && form.billingCycles.length > 0 && (form.monthlySubscriptionPrice === 0 || isNaN(form.monthlySubscriptionPrice)))
      errs.monthlySubscriptionPrice = 'Informe o valor base mensal da assinatura de plataforma'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      const url    = isEdit ? `/api/products/${product!.id}` : '/api/products'
      const method = isEdit ? 'PATCH' : 'POST'

      const payload = {
        name:                        form.name.trim(),
        type:                        form.type,
        description:                 form.description || null,
        price:                       Number(form.price),
        commissionPercentage:        Number(form.commissionPercentage),
        tenantId:                    form.tenantId || null,
        isActive:                    form.isActive,
        // Campos condicionais
        setupFee:                    isSubscription ? Number(form.setupFee) : 0,
        billingCycles:               isHardware ? form.billingCycles : ['MONTHLY'],
        allowCreditCardInstallments: form.allowCreditCardInstallments,
        maxInstallments:             Number(form.maxInstallments),
        // Assinatura mensal — só para HARDWARE, zerado para planos
        monthlySubscriptionPrice:    isHardware ? Number(form.monthlySubscriptionPrice) : 0,
      }

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(
        typeof data.error === 'object' ? data.error.message : (data.error || 'Erro desconhecido')
      )
      onSaved(data.product, !isEdit)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar produto'
      setErrors({ _global: msg })
    } finally {
      setLoading(false)
    }
  }

  const previewComm = commissionValue(Number(form.price), Number(form.commissionPercentage))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col">

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${isEdit ? 'bg-amber-100' : isSubscription ? 'bg-purple-100' : 'bg-blue-100'}`}>
              {isEdit
                ? <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                : isSubscription
                  ? <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  : <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              }
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{isEdit ? 'Editar Produto' : 'Novo Produto'}</h2>
              <p className="text-slate-400 text-xs">
                {isEdit ? `ID: ${product!.id.slice(0, 10)}…` : (
                  isSubscription ? 'Plano de Assinatura — campos de recorrência' : 'Hardware / Equipamento físico'
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400
              hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── Formulário com scroll ──────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Erro global */}
          {errors._global && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p className="text-red-700 text-sm font-medium">{errors._global}</p>
            </div>
          )}

          {/* ── Nome ─────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Nome do Produto <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder={isSubscription ? 'Ex: Plano Telemetria Premium Mensal' : 'Ex: Módulo Rastreador GT-500'}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                ${errors.name ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-300'}`}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.name}</p>}
          </div>

          {/* ── Tipo — seletor visual ─────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Tipo <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['HARDWARE', 'SUBSCRIPTION_PLAN'] as const).map(t => {
                const cfg     = TYPE_LABELS[t]
                const isActive = form.type === t
                return (
                  <button key={t} type="button" onClick={() => handleTypeChange(t)}
                    className={`flex flex-col items-start gap-1 px-4 py-3.5 rounded-xl border-2 transition-all text-left
                      ${isActive
                        ? t === 'HARDWARE'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-purple-500 bg-purple-50'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{cfg.icon}</span>
                      <span className={`text-sm font-bold ${
                        isActive ? (t === 'HARDWARE' ? 'text-blue-800' : 'text-purple-800') : 'text-slate-600'
                      }`}>{cfg.label}</span>
                    </div>
                    <p className={`text-[11px] ${
                      isActive ? (t === 'HARDWARE' ? 'text-blue-600' : 'text-purple-600') : 'text-slate-400'
                    }`}>
                      {t === 'HARDWARE' ? 'Venda única + assinatura obrigatória' : 'Recorrência mensal com taxa de adesão'}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Descrição ─────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Descrição <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Detalhe funcionalidades ou condições do produto…"
              rows={2}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700
                placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200
                focus:border-blue-300 focus:bg-white transition-all text-sm resize-none"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════
              CAMPOS CONDICIONAIS POR TIPO
          ══════════════════════════════════════════════════════════════ */}

          {/* ── SUBSCRIPTION_PLAN: Mensalidade + Adesão ─────────────────── */}
          {isSubscription && (
            <>
              {/* Banner indicador */}
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p className="text-purple-700 text-xs font-semibold">
                  Plano de Assinatura — configure mensalidade e taxa de instalação
                </p>
              </div>

              {/* Mensalidade + Adesão lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                {/* Mensalidade */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Valor da Mensalidade (R$) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                    <input type="number" min={0} step={0.01}
                      value={form.price}
                      onChange={e => setField('price', parseFloat(e.target.value) || 0)}
                      className={`w-full pl-9 pr-4 py-3 bg-slate-50 border rounded-xl text-slate-800
                        focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                        ${errors.price ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-purple-200 focus:border-purple-300'}`}
                    />
                  </div>
                  {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
                  <p className="text-slate-400 text-[11px] mt-1">Valor recorrente por mês</p>
                </div>

                {/* Taxa de Adesão / Instalação */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Valor de Instalação / Adesão (R$) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                    <input type="number" min={0} step={0.01}
                      value={form.setupFee}
                      onChange={e => setField('setupFee', parseFloat(e.target.value) || 0)}
                      className={`w-full pl-9 pr-4 py-3 bg-slate-50 border rounded-xl text-slate-800
                        focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                        ${errors.setupFee ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-purple-200 focus:border-purple-300'}`}
                    />
                  </div>
                  {errors.setupFee && <p className="text-red-500 text-xs mt-1">{errors.setupFee}</p>}
                  <p className="text-slate-400 text-[11px] mt-1">Cobrado 1× no ato da adesão</p>
                </div>
              </div>

              {/* Parcelamento do cartão */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Permite parcelamento no cartão</p>
                    <p className="text-xs text-slate-400">Habilitar parcelamento da taxa de adesão</p>
                  </div>
                  <button type="button"
                    onClick={() => setField('allowCreditCardInstallments', !form.allowCreditCardInstallments)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.allowCreditCardInstallments ? 'bg-purple-500' : 'bg-slate-300'
                    }`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      form.allowCreditCardInstallments ? 'translate-x-6' : 'translate-x-1'
                    }`}/>
                  </button>
                </div>
                {form.allowCreditCardInstallments && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Máximo de Parcelas
                    </label>
                    <select
                      value={form.maxInstallments}
                      onChange={e => setField('maxInstallments', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700
                        focus:outline-none focus:ring-2 focus:ring-purple-200">
                      {[1,2,3,4,5,6,7,8,9,10,12,18,24].map(n => (
                        <option key={n} value={n}>{n}× {n === 1 ? '(à vista)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── HARDWARE: Valor de venda + Ciclos obrigatórios ────────────── */}
          {isHardware && (
            <>
              {/* Banner indicador */}
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
                </svg>
                <p className="text-blue-700 text-xs font-semibold">
                  Equipamento físico — obriga assinatura de plataforma após a venda
                </p>
              </div>

              {/* Valor de Venda */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Valor de Venda do Equipamento (R$) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                  <input type="number" min={0} step={0.01}
                    value={form.price}
                    onChange={e => setField('price', parseFloat(e.target.value) || 0)}
                    className={`w-full pl-9 pr-4 py-3 bg-slate-50 border rounded-xl text-slate-800
                      focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                      ${errors.price ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-300'}`}
                  />
                </div>
                {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
              </div>

              {/* ── Valor Base Mensal da Assinatura ───────────────────── */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Valor Base Mensal da Assinatura (R$) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={form.monthlySubscriptionPrice}
                    onChange={e => {
                      setField('monthlySubscriptionPrice', parseFloat(e.target.value) || 0)
                    }}
                    placeholder="Ex: 89.90"
                    className={`w-full pl-9 pr-4 py-3 bg-slate-50 border rounded-xl text-slate-800
                      focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                      ${errors.monthlySubscriptionPrice
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-slate-200 focus:ring-blue-200 focus:border-blue-300'}`}
                  />
                </div>
                {errors.monthlySubscriptionPrice && (
                  <p className="text-red-500 text-xs mt-1 font-medium">{errors.monthlySubscriptionPrice}</p>
                )}
                <p className="text-slate-400 text-[11px] mt-1">
                  Base para cálculo automático dos totais de cada ciclo abaixo.
                </p>
              </div>

              {/* Ciclos de Assinatura Obrigatória */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Obrigar Assinatura de Plataforma <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-slate-400 normal-case">
                    — marque os ciclos permitidos
                  </span>
                </label>

                <div className="space-y-2">
                  {CYCLE_OPTIONS.map(opt => {
                    const checked   = form.billingCycles.includes(opt.value)
                    const baseVal   = Number(form.monthlySubscriptionPrice) || 0
                    const totalCiclo = baseVal * opt.months
                    const hasBase   = baseVal > 0

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleCycle(opt.value)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left
                          ${checked
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                      >
                        {/* Checkbox visual */}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                          ${checked
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-slate-300 bg-white'
                          }`}>
                          {checked && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                            </svg>
                          )}
                        </div>
                        <span className="text-lg">{opt.icon}</span>
                        <div className="flex-1">
                          <p className={`text-sm font-bold ${
                            checked ? 'text-blue-800' : 'text-slate-700'
                          }`}>{opt.label}</p>
                          <p className={`text-xs ${checked ? 'text-blue-500' : 'text-slate-400'}`}>
                            {opt.desc}
                          </p>
                        </div>
                        {/* ── Valor calculado em tempo real ── */}
                        <div className="text-right flex-shrink-0">
                          {hasBase ? (
                            <div className={`flex flex-col items-end gap-0.5`}>
                              <span className={`text-xs font-black ${
                                checked ? 'text-blue-700' : 'text-slate-500'
                              }`}>
                                {fmtBRL(totalCiclo)}
                              </span>
                              <span className={`text-[10px] ${
                                checked ? 'text-blue-400' : 'text-slate-400'
                              }`}>
                                {opt.months}× {fmtBRL(baseVal)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">informe valor</span>
                          )}
                        </div>
                        {checked && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-100
                            px-2 py-0.5 rounded-full border border-blue-200 ml-1">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {errors.billingCycles && (
                  <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1 font-medium">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    {errors.billingCycles}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Comissão (campo comum a ambos) ─────────────────────────── */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Comissão do Promotor (%) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input type="number" min={0} max={100} step={0.5}
                value={form.commissionPercentage}
                onChange={e => setField('commissionPercentage', parseFloat(e.target.value) || 0)}
                className={`w-full pl-4 pr-9 py-3 bg-slate-50 border rounded-xl text-slate-800
                  focus:outline-none focus:ring-2 focus:bg-white transition-all text-sm
                  ${errors.commissionPercentage ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-300'}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
            </div>
            {errors.commissionPercentage && <p className="text-red-500 text-xs mt-1">{errors.commissionPercentage}</p>}
          </div>

          {/* ── Preview da comissão ─────────────────────────────────────── */}
          <div className={`rounded-2xl px-5 py-4 border transition-all ${
            previewComm > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">💰 Preview da Comissão</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {fmtBRL(Number(form.price))} × {Number(form.commissionPercentage)}%
                  {isSubscription && form.setupFee > 0 && (
                    <span className="ml-2 text-purple-500">
                      + Adesão {fmtBRL(form.setupFee)}
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-black ${previewComm > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {fmtBRL(previewComm)}
                </p>
                <p className="text-xs text-slate-400">
                  {isSubscription ? 'por mês' : 'por venda'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Franquia / Tenant ──────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Franquia (Tenant)
            </label>
            <select
              value={form.tenantId}
              onChange={e => setField('tenantId', e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 focus:bg-white transition-all text-sm"
            >
              <option value="">🌐 Todos os tenants (produto global)</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>🏢 {t.nome}</option>
              ))}
            </select>
            <p className="text-slate-400 text-xs mt-1">
              Deixe em branco para disponibilizar o produto a todas as franquias.
            </p>
          </div>

          {/* ── Status ativo ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-700">Produto Ativo</p>
              <p className="text-xs text-slate-400">Produtos inativos não aparecem no PDV</p>
            </div>
            <button type="button" onClick={() => setField('isActive', !form.isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.isActive ? 'bg-emerald-500' : 'bg-slate-300'
              }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                form.isActive ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
          </div>
        </form>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/60 flex gap-3">
          <button type="button" onClick={onClose} disabled={loading}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold text-sm
              hover:bg-slate-100 transition-all disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition-all
              shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2
              ${isSubscription
                ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200 hover:shadow-purple-300'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 hover:shadow-blue-300'
              }`}>
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={isEdit ? 'M5 13l4 4L19 7' : 'M12 4v16m8-8H4'}/>
              </svg>
            )}
            {loading ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Produto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL CONFIRMAR DESATIVAR
// ─────────────────────────────────────────────────────────────────────────────
function ModalConfirm({
  product,
  onCancel,
  onConfirm,
  loading,
}: {
  product: Product
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Desativar Produto</h3>
            <p className="text-slate-400 text-xs mt-0.5">Esta ação pode ser revertida</p>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-slate-700 text-sm font-semibold">{product.name}</p>
          <p className="text-slate-400 text-xs mt-0.5">{fmtBRL(product.price)} · {product.commissionPercentage}% comissão</p>
        </div>
        <p className="text-slate-600 text-sm">
          O produto será marcado como <strong>inativo</strong> e não aparecerá no PDV.
          Você pode reativá-lo a qualquer momento.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-all
              flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
            Desativar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON ROW
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[140, 100, 90, 80, 90, 90, 80].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className={`h-4 bg-slate-100 rounded-lg animate-pulse`} style={{ width: w }}/>
        </td>
      ))}
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon, colorClass, sub }: {
  label: string; value: string | number; icon: string; colorClass: string; sub?: string
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-2xl font-black mt-1 text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ProdutosClient() {
  const [products,    setProducts]    = useState<Product[]>([])
  const [tenants,     setTenants]     = useState<Tenant[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active')
  const [filterType,   setFilterType]   = useState<FilterType>('all')
  const [filterTenant, setFilterTenant] = useState('all')
  const [toast,       setToast]       = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [confirmDel,  setConfirmDel]  = useState<Product | null>(null)
  const [delLoading,  setDelLoading]  = useState(false)
  const [reactivating, setReactivating] = useState<string | null>(null)

  // ── Fetch produtos ──────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/products?active=all', { cache: 'no-store' })
      const data = await res.json()
      setProducts(data.products ?? [])

      // Extrair tenants únicos dos produtos para o filtro
      const map = new Map<string, Tenant>()
      for (const p of (data.products ?? []) as Product[]) {
        if (p.tenant) map.set(p.tenant.id, p.tenant)
      }
      setTenants(Array.from(map.values()))
    } catch {
      setToast({ msg: 'Erro ao carregar produtos', tipo: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // ── Filtros aplicados ───────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !p.tenant?.nome.toLowerCase().includes(q)) return false
    }
    if (filterStatus === 'active'   && !p.isActive) return false
    if (filterStatus === 'inactive' &&  p.isActive) return false
    if (filterType   !== 'all'      && p.type !== filterType)    return false
    if (filterTenant !== 'all'      && p.tenantId !== filterTenant) return false
    return true
  })

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalAtivos     = products.filter(p => p.isActive).length
  const totalInativos   = products.filter(p => !p.isActive).length
  const totalHardware   = products.filter(p => p.type === 'HARDWARE' && p.isActive).length
  const totalPlanos     = products.filter(p => p.type === 'SUBSCRIPTION_PLAN' && p.isActive).length
  const maiorComissao   = products.filter(p => p.isActive).reduce((max, p) => {
    const v = commissionValue(p.price, p.commissionPercentage)
    return v > max ? v : max
  }, 0)

  // ── Handlers ────────────────────────────────────────────────────────────────
  function openCreate() { setEditProduct(null); setModalOpen(true) }
  function openEdit(p: Product) { setEditProduct(p); setModalOpen(true) }

  function handleSaved(p: Product, isNew: boolean) {
    if (isNew) {
      setProducts(prev => [p, ...prev])
      setToast({ msg: `Produto "${p.name}" criado com sucesso.`, tipo: 'success' })
    } else {
      setProducts(prev => prev.map(x => x.id === p.id ? p : x))
      setToast({ msg: `Produto "${p.name}" atualizado.`, tipo: 'success' })
    }
    setModalOpen(false)
  }

  async function handleDesativar() {
    if (!confirmDel) return
    setDelLoading(true)
    try {
      const res = await fetch(`/api/products/${confirmDel.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setProducts(prev => prev.map(p => p.id === confirmDel.id ? { ...p, isActive: false } : p))
      setToast({ msg: `"${confirmDel.name}" desativado com sucesso.`, tipo: 'success' })
      setConfirmDel(null)
    } catch {
      setToast({ msg: 'Erro ao desativar produto.', tipo: 'error' })
    } finally {
      setDelLoading(false)
    }
  }

  async function handleReativar(p: Product) {
    setReactivating(p.id)
    try {
      const res  = await fetch(`/api/products/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isActive: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error()
      setProducts(prev => prev.map(x => x.id === p.id ? data.product : x))
      setToast({ msg: `"${p.name}" reativado.`, tipo: 'success' })
    } catch {
      setToast({ msg: 'Erro ao reativar produto.', tipo: 'error' })
    } finally {
      setReactivating(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toast */}
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onHide={() => setToast(null)}/>}

      {/* Modal produto */}
      {modalOpen && (
        <ModalProduto
          product={editProduct}
          tenants={tenants}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Modal confirmação desativar */}
      {confirmDel && (
        <ModalConfirm
          product={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={handleDesativar}
          loading={delLoading}
        />
      )}

      <div className="space-y-6 max-w-7xl mx-auto">

        {/* ── Topo ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
              </div>
              <h1 className="text-2xl font-black text-slate-800">Catálogo e Comissionamento</h1>
            </div>
            <p className="text-slate-500 text-sm ml-[52px]">
              Gerencie produtos, planos e comissões de 30% para o PDV
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700
              text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200 hover:shadow-indigo-300
              transition-all self-start active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Novo Produto
          </button>
        </div>

        {/* ── Cards resumo ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Produtos Ativos"  value={loading ? '—' : totalAtivos}   icon="✅" colorClass="bg-emerald-50 border-emerald-200"/>
          <SummaryCard label="Inativos"         value={loading ? '—' : totalInativos}  icon="🔴" colorClass="bg-slate-50 border-slate-200"/>
          <SummaryCard label="Hardware"         value={loading ? '—' : totalHardware}  icon="📡" colorClass="bg-blue-50 border-blue-200"/>
          <SummaryCard
            label="Maior Comissão"
            value={loading ? '—' : fmtBRL(maiorComissao)}
            icon="💰"
            colorClass="bg-indigo-50 border-indigo-200"
            sub="por venda única"
          />
        </div>

        {/* ── Filtros e busca ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou franquia…"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 focus:bg-white transition-all"
            />
          </div>

          {/* Status */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(['active', 'inactive', 'all'] as FilterStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {s === 'active' ? '✅ Ativos' : s === 'inactive' ? '🔴 Inativos' : '🌐 Todos'}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as FilterType)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700
              focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">📦 Todos os tipos</option>
            <option value="HARDWARE">📡 Hardware</option>
            <option value="SUBSCRIPTION_PLAN">📋 Plano / Adesão</option>
          </select>

          {/* Tenant */}
          {tenants.length > 0 && (
            <select
              value={filterTenant}
              onChange={e => setFilterTenant(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">🏢 Todas as franquias</option>
              <option value="">🌐 Globais</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          )}

          {/* Refresh */}
          <button
            onClick={fetchProducts}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
            title="Atualizar"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        {/* ── Tabela de produtos ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-200">
                <tr>
                  {[
                    { label: 'Produto',              w: '' },
                    { label: 'Tipo',                 w: 'w-40' },
                    { label: 'Franquia',             w: 'w-36' },
                    { label: 'Preço / Adesão',       w: 'w-40' },
                    { label: 'Comissão %',           w: 'w-28' },
                    { label: '💰 Valor Comissão',    w: 'w-36' },
                    { label: 'Status',               w: 'w-24' },
                    { label: 'Ações',                w: 'w-28' },
                  ].map(h => (
                    <th key={h.label} className={`px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${h.w}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading
                  ? [...Array(4)].map((_, i) => <SkeletonRow key={i}/>)
                  : filtered.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
                              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                              </svg>
                            </div>
                            <p className="text-slate-700 font-bold">Nenhum produto encontrado</p>
                            <p className="text-slate-400 text-sm">Ajuste os filtros ou crie um novo produto</p>
                            <button
                              onClick={openCreate}
                              className="mt-1 text-indigo-600 text-sm font-bold hover:underline flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                              Criar primeiro produto
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                    : filtered.map((p, idx) => {
                      const commVal = commissionValue(p.price, p.commissionPercentage)
                      return (
                        <tr
                          key={p.id}
                          className={`group transition-colors ${
                            p.isActive
                              ? 'hover:bg-indigo-50/30'
                              : 'bg-slate-50/50 hover:bg-slate-100/50 opacity-75'
                          }`}
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          {/* Nome */}
                          <td className="px-5 py-4">
                            <div>
                              <p className="text-slate-800 font-bold text-sm">{p.name}</p>
                              {p.description && (
                                <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[220px]">{p.description}</p>
                              )}
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="px-5 py-4">
                            <TypeBadge type={p.type}/>
                          </td>

                          {/* Franquia */}
                          <td className="px-5 py-4">
                            {p.tenant
                              ? <span className="text-slate-700 text-sm font-medium">{p.tenant.nome}</span>
                              : <span className="text-slate-400 text-xs italic">Global</span>
                            }
                          </td>

                          {/* Preço + Adesão + Ciclos */}
                          <td className="px-5 py-4">
                            <div className="space-y-1">
                              <span className="text-slate-800 font-bold text-sm">{fmtBRL(p.price)}</span>
                              {p.type === 'SUBSCRIPTION_PLAN' && (p as Product & { setupFee?: number }).setupFee !== undefined && (
                                <p className="text-purple-600 text-xs font-medium">
                                  + Adesão {fmtBRL((p as Product & { setupFee?: number }).setupFee ?? 0)}
                                </p>
                              )}
                              {p.type === 'HARDWARE' && Array.isArray((p as Product & { billingCycles?: string[] }).billingCycles) && (
                                <div className="flex flex-wrap gap-1">
                                  {((p as Product & { billingCycles?: string[] }).billingCycles ?? []).map((c: string) => (
                                    <span key={c} className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md border border-blue-200">
                                      {c === 'QUARTERLY' ? '3M' : c === 'SEMI_ANNUALLY' ? '6M' : c === 'ANNUALLY' ? '12M' : c}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* % Comissão */}
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">
                              {p.commissionPercentage}%
                            </span>
                          </td>

                          {/* 💰 Valor da comissão — coluna de destaque */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
                                <span className="text-emerald-700 font-black text-sm">{fmtBRL(commVal)}</span>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            {p.isActive
                              ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Ativo
                                </span>
                              : <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-xs font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>Inativo
                                </span>
                            }
                          </td>

                          {/* Ações */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              {/* Editar */}
                              <button
                                onClick={() => openEdit(p)}
                                title="Editar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-blue-100
                                  text-slate-500 hover:text-blue-600 transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                              </button>

                              {/* Desativar / Reativar */}
                              {p.isActive ? (
                                <button
                                  onClick={() => setConfirmDel(p)}
                                  title="Desativar"
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-amber-100
                                    text-slate-500 hover:text-amber-600 transition-all"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReativar(p)}
                                  disabled={reactivating === p.id}
                                  title="Reativar"
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-emerald-100
                                    text-slate-500 hover:text-emerald-600 transition-all disabled:opacity-50"
                                >
                                  {reactivating === p.id
                                    ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                                  }
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          {/* Footer tabela */}
          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/20 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-slate-400 text-xs font-medium">
                {filtered.length} produto{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== products.length && ` (de ${products.length} total)`}
              </p>
              <div className="flex items-center gap-4">
                {filterStatus !== 'inactive' && (
                  <p className="text-indigo-600 text-xs font-bold">
                    💰 Maior comissão ativa:{' '}
                    <span className="font-black">{fmtBRL(maiorComissao)}</span>
                  </p>
                )}
                <p className="text-emerald-600 text-xs font-bold">
                  Total comissão filtrada:{' '}
                  <span className="font-black">
                    {fmtBRL(filtered.reduce((s, p) => s + commissionValue(p.price, p.commissionPercentage), 0))}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
