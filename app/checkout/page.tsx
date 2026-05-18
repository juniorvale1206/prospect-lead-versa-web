'use client'

/**
 * /checkout  — Checkout Público VAPEC
 *
 * Layout pixel-perfect inspirado no Stripe Checkout:
 *   Col esquerda  → Produto (plano, preço, features)
 *   Col direita   → Formulário (dados pessoais → veículo → agendamento → pagamento)
 *
 * Fluxo em 4 sub-etapas:
 *   1. Dados pessoais + veículo
 *   2. Escolha da loja + data/hora
 *   3. Técnico + confirmação do slot
 *   4. Pagamento (Stripe ou PIX/Boleto)
 */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type PlanId   = 'rastremix' | 'gpsmy' | 'topypro'
type Interval = 'month' | 'year'
type Step     = 'dados' | 'loja' | 'horario' | 'pagamento' | 'sucesso'

interface VapecPlan {
  id: PlanId; name: string; subtitle: string; icon: string
  monthlyPrice: number; annualPrice: number; savingPct: number
  features: string[]; recommended?: boolean; color: string
}

// ─── Planos VAPEC 2026 ────────────────────────────────────────────────────────
const PLANS: VapecPlan[] = [
  {
    id: 'rastremix', name: 'Rastremix', subtitle: 'Rastreamento básico', icon: '📡', color: '#6366f1',
    monthlyPrice: 200, annualPrice: 1872, savingPct: 22,
    features: ['Rastreamento em tempo real', 'Histórico 90 dias', 'App motorista', 'Cercas virtuais'],
  },
  {
    id: 'gpsmy', name: 'GPS My', subtitle: 'Telemetria avançada', icon: '🛰️', color: '#8b5cf6',
    monthlyPrice: 250, annualPrice: 2340, savingPct: 22,
    features: ['Tudo do Rastremix', 'Sensor de fadiga DMS', 'Identificação motorista', 'Relatórios gerenciais', 'Dashboard web'],
    recommended: true,
  },
  {
    id: 'topypro', name: 'Topy Pro', subtitle: 'Videotelemetria 360°', icon: '📷', color: '#7c3aed',
    monthlyPrice: 300, annualPrice: 2808, savingPct: 22,
    features: ['Tudo do GPS My', 'Câmera ADAS + DMS 360°', 'Bloqueio remoto', 'Cercas elétricas', 'Videotelemetria HD'],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function toISO(d: Date) { return d.toISOString().split('T')[0] }

// ─── Gerar horários padrão 09-18 de hora em hora ─────────────────────────────
function defaultTimeSlots() {
  const slots = []
  for (let h = 8; h <= 17; h++) {
    slots.push({ startTime: `${String(h).padStart(2,'0')}:00`, endTime: `${String(h+1).padStart(2,'0')}:00` })
  }
  return slots
}

// ─── Componente principal ─────────────────────────────────────────────────────
function CheckoutContent() {
  const searchParams = useSearchParams()

  // ── Estado geral ─────────────────────────────────────────────────────────
  const [step,     setStep]     = useState<Step>('dados')
  const [planId,   setPlanId]   = useState<PlanId>((searchParams.get('plan') as PlanId) ?? 'gpsmy')
  const [interval, setInterval] = useState<Interval>('month')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // ── Dados pessoais ────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '', email: '', phone: '', cpf: '',
    plate: '', vehicleBrand: '', vehicleModel: '', vehicleYear: '',
  })

  // ── Agenda ────────────────────────────────────────────────────────────────
  const [stores,        setStores]       = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [calendarDate,  setCalendarDate]  = useState<Date>(addDays(new Date(), 1))
  const [weekStart,     setWeekStart]     = useState<Date>(addDays(new Date(), 1))
  const [availability,  setAvailability]  = useState<DayAvail[]>([])
  const [selectedDate,  setSelectedDate]  = useState<string>('')
  const [selectedSlot,  setSelectedSlot]  = useState<SlotItem | null>(null)
  const [technicians,   setTechnicians]   = useState<Technician[]>([])
  const [selectedTech,  setSelectedTech]  = useState<string>('')
  const [loadingSlots,  setLoadingSlots]  = useState(false)

  // ── Resultado ─────────────────────────────────────────────────────────────
  const [orderId,      setOrderId]      = useState('')
  const [appointmentId, setAppointmentId] = useState('')

  const plan  = PLANS.find((p) => p.id === planId)!
  const price = interval === 'month' ? plan.monthlyPrice : plan.annualPrice
  const tenantId = searchParams.get('tenantId') ?? ''

  // ── Carregar lojas ────────────────────────────────────────────────────────
  const loadStores = useCallback(async () => {
    try {
      const r = await fetch(`/api/agenda/lojas?tenantId=${tenantId}`)
      const d = await r.json()
      setStores(d.stores ?? [])
      if (d.stores?.length === 1) setSelectedStore(d.stores[0].id)
    } catch { setStores([]) }
  }, [tenantId])

  useEffect(() => { if (step === 'loja') loadStores() }, [step, loadStores])

  // ── Carregar disponibilidade ──────────────────────────────────────────────
  const loadAvailability = useCallback(async (storeId: string, start: Date) => {
    if (!storeId) return
    setLoadingSlots(true)
    try {
      const startStr = toISO(start)
      const endStr   = toISO(addDays(start, 6))
      const r = await fetch(`/api/agenda/disponibilidade?storeId=${storeId}&startDate=${startStr}&endDate=${endStr}`)
      const d = await r.json()
      setAvailability(d.days ?? [])
    } catch { setAvailability([]) }
    finally { setLoadingSlots(false) }
  }, [])

  useEffect(() => {
    if (step === 'horario' && selectedStore) loadAvailability(selectedStore, weekStart)
  }, [step, selectedStore, weekStart, loadAvailability])

  // ── Carregar técnicos da loja ─────────────────────────────────────────────
  const loadTechnicians = useCallback(async (storeId: string) => {
    try {
      const r = await fetch(`/api/admin/agenda/tecnicos?storeId=${storeId}`)
      const d = await r.json()
      setTechnicians(d.technicians ?? [])
    } catch { setTechnicians([]) }
  }, [])

  useEffect(() => {
    if (selectedStore) loadTechnicians(selectedStore)
  }, [selectedStore, loadTechnicians])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDados = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.phone) { setError('Preencha nome, e-mail e telefone'); return }
    if (!form.plate) { setError('Informe a placa do veículo'); return }
    setError('')
    setStep('loja')
  }

  const handleLoja = () => {
    if (!selectedStore) { setError('Selecione uma loja para a instalação'); return }
    setError('')
    setStep('horario')
  }

  const handleHorario = () => {
    if (!selectedDate || !selectedSlot) { setError('Selecione data e horário'); return }
    setError('')
    confirmAgendamento()
  }

  const confirmAgendamento = async () => {
    setLoading(true); setError('')
    try {
      // 1. Criar pedido rascunho
      const orderRes = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType: 'B2C', originType: 'DIGITAL' }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderData.error ?? 'Erro ao criar pedido')
      const oid = orderData.id
      setOrderId(oid)

      // 2. Vincular cliente
      await fetch(`/api/admin/orders/${oid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'client',
          clientName: form.name, clientPhone: form.phone.replace(/\D/g,''),
          clientEmail: form.email, clientType: 'PF',
        }),
      })

      // 3. Vincular veículo
      await fetch(`/api/admin/orders/${oid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'vehicle',
          plate:        form.plate       || undefined,
          vehicleBrand: form.vehicleBrand || undefined,
          vehicleModel: form.vehicleModel || undefined,
          vehicleYear:  form.vehicleYear  ? parseInt(form.vehicleYear) : undefined,
          vehicleType:  'CARRO',
        }),
      })

      // 4. Vincular plano
      await fetch(`/api/admin/orders/${oid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'plan', planName: plan.name, baseValue: price,
          planType: interval === 'month' ? 'MONTHLY' : 'ANNUAL',
          paymentMethod: 'PIX',
        }),
      })

      // 5. Agendar instalação
      const apptRes = await fetch('/api/agenda/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId:      oid,
          storeId:      selectedStore,
          technicianId: selectedTech || undefined,
          storeSlotId:  selectedSlot!.id,
          scheduledDate: selectedDate,
          startTime:    selectedSlot!.startTime,
          endTime:      selectedSlot!.endTime,
          clientName:   form.name,
          clientPhone:  form.phone,
          clientEmail:  form.email,
          plate:        form.plate,
          vehicleModel: form.vehicleModel,
        }),
      })
      const apptData = await apptRes.json()
      if (!apptRes.ok) throw new Error(apptData.error ?? 'Erro ao agendar')
      setAppointmentId(apptData.id)

      setStep('pagamento')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  const handlePagamento = async (method: 'stripe' | 'pix' | 'boleto') => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/pagamentos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId, interval, method,
          customerEmail: form.email,
          customerName:  form.name,
          orderId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Erro no checkout')
      if (d.url) { window.location.href = d.url; return }
      setStep('sucesso')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f9fc] flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">V</div>
          <span className="font-semibold text-gray-800">VAPEC Telemetria</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Checkout seguro
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8">

          {/* ════ COL ESQUERDA — Detalhes do Plano ════ */}
          <aside className="lg:w-[380px] flex-shrink-0 space-y-6">

            {/* Seletor de plano */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Escolha seu plano</p>
              <div className="space-y-2">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
                      planId === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{p.icon}</span>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                            {p.name}
                            {p.recommended && (
                              <span className="text-[10px] bg-indigo-600 text-white rounded px-1.5 py-0.5 font-bold">Popular</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{p.subtitle}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900 text-sm">{fmt(p.monthlyPrice)}<span className="font-normal text-gray-400 text-xs">/mês</span></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Detalhes do plano selecionado */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl" style={{ background: plan.color + '20' }}>
                  {plan.icon}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{plan.name}</div>
                  <div className="text-xs text-gray-500">{plan.subtitle}</div>
                </div>
              </div>

              {/* Toggle mensal/anual */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
                <button
                  onClick={() => setInterval('month')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${interval === 'month' ? 'bg-white shadow text-indigo-700' : 'text-gray-500'}`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setInterval('year')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${interval === 'year' ? 'bg-white shadow text-indigo-700' : 'text-gray-500'}`}
                >
                  Anual <span className="text-green-600 font-bold text-xs">-22%</span>
                </button>
              </div>

              {/* Preço */}
              <div className="mb-4">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">{fmt(price)}</span>
                  <span className="text-gray-400 text-sm mb-1">/{interval === 'month' ? 'mês' : 'ano'}</span>
                </div>
                {interval === 'year' && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Economia de {fmt(plan.monthlyPrice * 12 - plan.annualPrice)} por ano
                  </p>
                )}
              </div>

              <hr className="border-gray-100 mb-4" />

              {/* Features */}
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <hr className="border-gray-100 my-4" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total hoje</span>
                <span className="font-bold text-gray-900">{fmt(price)}</span>
              </div>
            </div>

            {/* Badges de confiança */}
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">🔒 SSL 256-bit</span>
              <span className="flex items-center gap-1">✓ PCI DSS</span>
              <span className="flex items-center gap-1">📜 Contrato digital</span>
            </div>
          </aside>

          {/* ════ COL DIREITA — Formulário ════ */}
          <div className="flex-1 min-w-0">

            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-6">
              {(['dados','loja','horario','pagamento'] as Step[]).map((s, i) => {
                const labels: Record<string, string> = { dados: 'Seus dados', loja: 'Loja', horario: 'Horário', pagamento: 'Pagamento' }
                const steps: Step[] = ['dados','loja','horario','pagamento']
                const idx = steps.indexOf(step)
                const done = i < idx
                const active = s === step
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-0.5 flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        done ? 'bg-green-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] font-medium ${active ? 'text-indigo-600' : 'text-gray-400'}`}>{labels[s]}</span>
                    </div>
                    {i < 3 && <div className={`h-0.5 flex-1 mx-1 rounded ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
                  </div>
                )
              })}
            </div>

            {/* ── CARD DO FORMULÁRIO ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

              {/* Erro */}
              {error && (
                <div className="mx-6 mt-5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* ─── STEP 1: Dados pessoais + veículo ─────────────────────── */}
              {step === 'dados' && (
                <form onSubmit={handleDados} className="p-6 space-y-5">
                  <h2 className="text-lg font-bold text-gray-900">Seus dados</h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome completo *</label>
                      <input required value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="João Silva" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail *</label>
                      <input required type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="joao@email.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Telefone / WhatsApp *</label>
                      <input required value={form.phone} onChange={(e) => setForm(f => ({...f, phone: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="(11) 99999-0000" />
                    </div>
                  </div>

                  <hr className="border-gray-100" />
                  <h3 className="font-semibold text-gray-700 text-sm">🚗 Veículo para instalação</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Placa *</label>
                      <input required value={form.plate} onChange={(e) => setForm(f => ({...f, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="ABC1D23" maxLength={8} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Marca</label>
                      <input value={form.vehicleBrand} onChange={(e) => setForm(f => ({...f, vehicleBrand: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Ford, Toyota…" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modelo</label>
                      <input value={form.vehicleModel} onChange={(e) => setForm(f => ({...f, vehicleModel: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Hilux, Onix…" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ano</label>
                      <input type="number" value={form.vehicleYear} onChange={(e) => setForm(f => ({...f, vehicleYear: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        min={1990} max={new Date().getFullYear()+1} placeholder="2024" />
                    </div>
                  </div>

                  <button type="submit" className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all text-sm shadow-md">
                    Continuar → Escolher local
                  </button>
                </form>
              )}

              {/* ─── STEP 2: Escolha da loja ──────────────────────────────── */}
              {step === 'loja' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Escolha o local de instalação</h2>
                    <button onClick={() => setStep('dados')} className="text-xs text-indigo-600 hover:underline">← Voltar</button>
                  </div>
                  <p className="text-sm text-gray-500">Selecione a loja mais próxima de você. O técnico fará a instalação no local.</p>

                  {stores.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <div className="text-4xl mb-2">📍</div>
                      <p className="text-sm">Nenhuma loja disponível no momento.</p>
                      <p className="text-xs mt-1">Entre em contato para agendamento especial.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => setSelectedStore(store.id)}
                          className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                            selectedStore === store.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-lg flex-shrink-0">🏪</div>
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{store.name}</div>
                                {store.address && <div className="text-xs text-gray-500 mt-0.5">{store.address}</div>}
                                {store.cidade && <div className="text-xs text-gray-400">{store.cidade}{store.uf ? ` - ${store.uf}` : ''}</div>}
                                {store.technicians?.length > 0 && (
                                  <div className="text-xs text-green-600 mt-1 font-medium">
                                    {store.technicians.length} técnico{store.technicians.length > 1 ? 's' : ''} disponível{store.technicians.length > 1 ? 'is' : ''}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedStore === store.id && (
                              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleLoja}
                    disabled={!selectedStore}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm shadow-md"
                  >
                    Continuar → Escolher horário
                  </button>
                </div>
              )}

              {/* ─── STEP 3: Calendário + Horário ────────────────────────── */}
              {step === 'horario' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Agendar instalação</h2>
                    <button onClick={() => setStep('loja')} className="text-xs text-indigo-600 hover:underline">← Voltar</button>
                  </div>

                  {/* Técnico (opcional) */}
                  {technicians.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Técnico (opcional)</label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setSelectedTech('')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedTech ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                        >
                          Qualquer técnico
                        </button>
                        {technicians.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTech(t.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedTech === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Navegação semana */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { const d = addDays(weekStart, -7); if (d > new Date()) setWeekStart(d) }}
                      disabled={weekStart <= addDays(new Date(), 0)}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="text-sm font-semibold text-gray-700">
                      {MESES[weekStart.getMonth()]} {weekStart.getFullYear()}
                    </span>
                    <button
                      onClick={() => setWeekStart(addDays(weekStart, 7))}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>

                  {/* Grade de dias */}
                  {loadingSlots ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Carregando disponibilidade…</div>
                  ) : availability.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
                      <div className="text-2xl mb-2">📅</div>
                      <p className="font-medium">Nenhum horário cadastrado para esta loja ainda.</p>
                      <p className="text-xs mt-1 text-amber-600">Entre em contato pelo telefone para agendar manualmente.</p>
                    </div>
                  ) : (
                    <>
                      {/* Dias da semana */}
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = addDays(weekStart, i)
                          const iso = toISO(d)
                          const dayData = availability.find((av) => av.date === iso)
                          const hasSlots = dayData?.hasAvailability ?? false
                          const isSelected = selectedDate === iso
                          const isPast = d < new Date()

                          return (
                            <button
                              key={iso}
                              disabled={isPast || !hasSlots}
                              onClick={() => { setSelectedDate(iso); setSelectedSlot(null) }}
                              className={`flex flex-col items-center py-2 rounded-xl border transition-all ${
                                isPast ? 'opacity-30 cursor-not-allowed border-transparent' :
                                isSelected ? 'bg-indigo-600 border-indigo-600 text-white' :
                                hasSlots  ? 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer' :
                                'border-transparent text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              <span className="text-[10px] font-medium">{DIAS_SEMANA[d.getDay()]}</span>
                              <span className="text-base font-bold">{d.getDate()}</span>
                              {hasSlots && !isSelected && <span className="w-1 h-1 rounded-full bg-green-400 mt-0.5" />}
                            </button>
                          )
                        })}
                      </div>

                      {/* Horários do dia selecionado */}
                      {selectedDate && (() => {
                        const dayData = availability.find((av) => av.date === selectedDate)
                        const slots = dayData?.slots?.filter((s) => s.available) ?? []
                        return slots.length > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Horários disponíveis — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {slots.map((sl) => (
                                <button
                                  key={sl.id}
                                  onClick={() => setSelectedSlot(sl)}
                                  className={`py-2 px-3 rounded-xl border text-sm font-semibold transition-all ${
                                    selectedSlot?.id === sl.id
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                                  }`}
                                >
                                  {sl.startTime}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-400 text-sm">Sem horários disponíveis neste dia.</div>
                        )
                      })()}
                    </>
                  )}

                  <button
                    onClick={handleHorario}
                    disabled={!selectedDate || !selectedSlot || loading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm shadow-md"
                  >
                    {loading ? 'Confirmando…' : 'Confirmar agendamento →'}
                  </button>
                </div>
              )}

              {/* ─── STEP 4: Pagamento ────────────────────────────────────── */}
              {step === 'pagamento' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Pagamento</h2>
                  </div>

                  {/* Resumo do agendamento */}
                  {selectedDate && selectedSlot && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">✅</span>
                        <div>
                          <p className="font-semibold text-green-800 text-sm">Instalação agendada!</p>
                          <p className="text-xs text-green-700 mt-0.5">
                            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} às {selectedSlot.startTime}
                          </p>
                          <p className="text-xs text-green-600">{stores.find(s => s.id === selectedStore)?.name}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botões de pagamento expresso */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handlePagamento('stripe')}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-3 bg-black hover:bg-gray-900 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 0C5.149 0 0 5.149 0 11.5S5.149 23 11.5 23 23 17.851 23 11.5 17.851 0 11.5 0zm4.5 8.75l-1.75.5c-.25-1-.75-1.5-1.5-1.5-.5 0-1 .25-1 .75 0 1.5 4.25 1.25 4.25 4.25 0 1.75-1.25 3-3.25 3.25V17h-1.5v-1.25C11 15.5 9.5 14.5 9 13l1.75-.75c.5 1 1.25 1.75 2.25 1.75.75 0 1.25-.5 1.25-1 0-1.5-4.25-1.25-4.25-4.25 0-1.75 1.25-3 3.25-3.25V4h1.5v1.25c1.25.25 2.25 1 2.75 2.25l.5.25z"/></svg>
                        Apple Pay
                      </button>
                      <button
                        onClick={() => handlePagamento('stripe')}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-3 bg-[#00D64F] hover:bg-[#00C246] text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                      >
                        🔗 Pagar com Link
                      </button>
                    </div>

                    <div className="flex items-center gap-3 my-1">
                      <hr className="flex-1 border-gray-200" />
                      <span className="text-xs text-gray-400">Ou pague de outra forma</span>
                      <hr className="flex-1 border-gray-200" />
                    </div>

                    {/* Cartão */}
                    <button
                      onClick={() => handlePagamento('stripe')}
                      disabled={loading}
                      className="w-full py-3.5 border-2 border-indigo-500 text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      💳 Pagar com Cartão — {fmt(price)}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handlePagamento('pix')}
                        disabled={loading}
                        className="py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        📱 PIX
                      </button>
                      <button
                        onClick={() => handlePagamento('boleto')}
                        disabled={loading}
                        className="py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        📄 Boleto
                      </button>
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-400">
                    🔒 Pagamento processado com segurança via Stripe. <br />
                    Dados criptografados com SSL 256-bit.
                  </p>
                </div>
              )}

              {/* ─── STEP 5: Sucesso ──────────────────────────────────────── */}
              {step === 'sucesso' && (
                <div className="p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto text-3xl">✅</div>
                  <h2 className="text-2xl font-extrabold text-gray-900">Tudo certo!</h2>
                  <p className="text-gray-600 text-sm">
                    Seu agendamento foi confirmado e o pagamento processado com sucesso.
                    Em breve você receberá a confirmação por e-mail.
                  </p>
                  {selectedDate && selectedSlot && (
                    <div className="bg-indigo-50 rounded-xl p-4 text-sm">
                      <p className="font-semibold text-indigo-800">📅 Instalação agendada</p>
                      <p className="text-indigo-700 mt-1">
                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        {' às '}{selectedSlot.startTime}
                      </p>
                    </div>
                  )}
                  <a href="/" className="inline-block mt-4 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">
                    Ir para o painel →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">
          Powered by <span className="font-semibold">VAPEC Telemetria</span> · 
          <a href="#" className="hover:underline ml-1">Privacidade</a> · 
          <a href="#" className="hover:underline ml-1">Termos</a> · 
          <a href="#" className="hover:underline ml-1">Suporte</a>
        </p>
      </footer>
    </div>
  )
}

// ─── Tipos auxiliares (dentro do componente para simplicidade) ────────────────
interface Store {
  id: string; name: string; address?: string; cidade?: string; uf?: string
  storeType?: string; category?: string
  technicians: { id: string; name: string; phone?: string }[]
}
interface DayAvail {
  date: string; hasAvailability: boolean
  slots: SlotItem[]
}
interface SlotItem {
  id: string; startTime: string; endTime: string; available: boolean
  source?: string; technicianId?: string
}
interface Technician {
  id: string; name: string; phone?: string
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f6f9fc]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando checkout…</p>
        </div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
