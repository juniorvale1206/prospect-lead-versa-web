'use client'

/**
 * Página de Gestão de Pedidos B2B/B2C — ProspecLead Admin
 *
 * Funcionalidades:
 *  - KPIs (receita, por status, por tipo)
 *  - Wizard 5 etapas: Tipo → Cliente + Endereço → Veículo/Frota → Plano VAPEC → Confirmar
 *  - Planos VAPEC hardcoded (Rastremix R$200 / GPS My R$250 / Topy Pro R$300)
 *  - Lookup ViaCEP automático
 *  - Tabela com filtros, paginação, cancelamento com motivo
 *  - Compatível com OrigemType: PROPRIA / DIAMANTE / DIGITAL / PROMOTER / ADMIN
 */

import { useEffect, useState, useCallback } from 'react'

// ─── Planos VAPEC 2026 v1.4 (hardcoded para não depender de /api/admin/produtos) ──
const VAPEC_PLANS = [
  {
    id: 'rastremix',
    name: 'Rastremix',
    monthlyPrice: 200,
    annualPrice: 1872,
    annualSaving: 528,
    icon: '📡',
    color: 'blue',
    badge: null,
    features: [
      'Rastreamento em tempo real',
      'Histórico de 90 dias',
      'App para motorista',
      'Cercas virtuais ilimitadas',
      'Alertas de velocidade',
      'Suporte via WhatsApp',
    ],
    ideal: 'Frotas até 50 veículos',
  },
  {
    id: 'gpsmy',
    name: 'GPS My',
    monthlyPrice: 250,
    annualPrice: 2340,
    annualSaving: 660,
    icon: '🛰️',
    color: 'indigo',
    badge: 'MAIS POPULAR',
    features: [
      'Tudo do Rastremix',
      'Histórico de 180 dias',
      'Sensor de fadiga (câmera DMS)',
      'Identificação de motorista',
      'Relatórios gerenciais',
      'Dashboard web completo',
      'API de integração',
    ],
    ideal: 'Frotas até 200 veículos',
  },
  {
    id: 'topypro',
    name: 'Topy Pro',
    monthlyPrice: 300,
    annualPrice: 2808,
    annualSaving: 792,
    icon: '🏭',
    color: 'purple',
    badge: 'ENTERPRISE',
    features: [
      'Tudo do GPS My',
      'Histórico ilimitado',
      'Câmera ADAS + DMS (visão 360°)',
      'Bloqueio de partida remoto',
      'Cercas elétricas industriais',
      'Videotelemetria HD',
      'Suporte prioritário 24/7',
      'Integração Vale / mineração',
    ],
    ideal: 'Frotas ilimitadas — Mineração',
  },
]

const ORIGIN_TYPES = [
  { value: 'PROPRIA', label: '🏪 Loja Própria', desc: 'Venda direta pela loja VAPEC' },
  { value: 'DIAMANTE', label: '💎 Parceiro Diamante', desc: 'Revendedor categoria Diamante' },
  { value: 'DIGITAL', label: '💻 Canal Digital', desc: 'Venda via plataforma digital' },
  { value: 'PROMOTER', label: '👤 Promotor', desc: 'Venda por promotor credenciado' },
  { value: 'ADMIN', label: '⚙️ Admin', desc: 'Pedido manual pelo backoffice' },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Order {
  id: string
  orderNumber: string
  orderType: 'B2B' | 'B2C'
  status: string
  clientName: string | null
  clientCpfCnpj: string | null
  clientPhone: string | null
  plate: string | null
  planName: string | null
  netValue: number
  totalValue: number
  originType: string
  createdAt: string
  promoter?: { id: string; nome: string } | null
  pdv?: { id: string; name: string; category: string } | null
}

interface OrderStats {
  byStatus: Record<string, number>
  byType: Record<string, number>
  totalRevenue: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: 'Rascunho',  color: 'bg-gray-100 text-gray-600' },
  PENDING:   { label: 'Pendente',  color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE:    { label: 'Ativo',     color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
  COMPLETED: { label: 'Concluído', color: 'bg-blue-100 text-blue-700' },
}

function fmt(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDoc(doc: string | null) {
  if (!doc) return '—'
  const c = doc.replace(/\D/g, '')
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

const PLAN_COLOR: Record<string, string> = {
  blue:   'border-blue-500 bg-blue-50 ring-blue-500',
  indigo: 'border-indigo-500 bg-indigo-50 ring-indigo-500',
  purple: 'border-purple-500 bg-purple-50 ring-purple-500',
}
const PLAN_BTN: Record<string, string> = {
  blue:   'bg-blue-600 hover:bg-blue-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
  purple: 'bg-purple-600 hover:bg-purple-700',
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
function OrderWizard({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(0)
  const [orderId, setOrderId]       = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // Step 0
  const [orderType, setOrderType]   = useState<'B2C' | 'B2B'>('B2C')
  const [originType, setOriginType] = useState('PROMOTER')

  // Step 1 — cliente
  const [client, setClient] = useState({
    clientName: '', clientCpfCnpj: '', clientPhone: '', clientEmail: '',
    clientType: 'PF', cep: '', logradouro: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: '',
  })

  // Step 2 — veículo / frota
  const [vehicle, setVehicle] = useState({
    plate: '', vehicleBrand: '', vehicleModel: '', vehicleYear: '',
    vehicleType: 'CARRO', fleetSize: '', segmento: '',
  })

  // Step 3 — plano
  const [selectedPlanId, setSelectedPlanId] = useState('gpsmy')
  const [planType, setPlanType]             = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [paymentMethod, setPaymentMethod]   = useState('PIX')
  const [discountValue, setDiscountValue]   = useState('0')
  const [installments, setInstallments]     = useState('1')

  const selectedPlan = VAPEC_PLANS.find((p) => p.id === selectedPlanId)!
  const basePrice    = planType === 'MONTHLY' ? selectedPlan.monthlyPrice : selectedPlan.annualPrice
  const discountNum  = parseFloat(discountValue) || 0
  const netPrice     = Math.max(0, basePrice - discountNum)

  // CEP lookup
  const lookupCep = async (cep: string) => {
    const c = cep.replace(/\D/g, '')
    if (c.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const d = await r.json()
      if (!d.erro) setClient((prev) => ({ ...prev, logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf }))
    } catch {}
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'
  const stepLabels = ['Tipo', 'Cliente', orderType === 'B2B' ? 'Frota' : 'Veículo', 'Plano', 'Confirmar']

  // ── Step handlers ────────────────────────────────────────────────────────────
  const handleCreateDraft = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType, originType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar pedido')
      setOrderId(data.id); setOrderNumber(data.orderNumber); setStep(1)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  const handleClient = async (e: React.FormEvent) => {
    e.preventDefault(); if (!orderId) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'client', ...client }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setStep(2)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  const handleVehicle = async (e: React.FormEvent) => {
    e.preventDefault(); if (!orderId) return
    setLoading(true); setError('')
    try {
      const payload = orderType === 'B2B'
        ? { fleetSize: parseInt(vehicle.fleetSize) || 1, segmento: vehicle.segmento }
        : { ...vehicle, vehicleYear: parseInt(vehicle.vehicleYear) || undefined }
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'vehicle', ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setStep(3)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault(); if (!orderId) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'plan',
          planName:  selectedPlan.name,
          baseValue: basePrice,           // ← preço base do plano VAPEC hardcoded
          planType,
          paymentMethod,
          discountValue: discountNum,
          installments: parseInt(installments) || 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setStep(4)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  const handleConfirm = async () => {
    if (!orderId) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'confirm' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      onSuccess()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* Header gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">📦 Novo Pedido</h2>
              {orderNumber && <p className="text-indigo-200 text-sm font-mono mt-0.5">#{orderNumber}</p>}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-xl font-bold transition">×</button>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center flex-1 min-w-0">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step ? 'bg-green-400 text-white' : i === step ? 'bg-white text-indigo-700' : 'bg-indigo-400/40 text-indigo-200'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`ml-1 text-xs truncate hidden sm:block ${i === step ? 'text-white font-semibold' : 'text-indigo-300'}`}>{label}</span>
                {i < stepLabels.length - 1 && <div className="flex-1 h-px bg-indigo-400/40 mx-1.5" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <span className="text-lg leading-none">⚠️</span> {error}
            </div>
          )}

          {/* ── Step 0: Tipo + Origem ─────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Tipo de Pedido</h3>
                <div className="grid grid-cols-2 gap-4">
                  {(['B2C', 'B2B'] as const).map((type) => (
                    <button key={type} onClick={() => setOrderType(type)}
                      className={`p-5 border-2 rounded-xl text-center transition-all ${
                        orderType === type ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:border-indigo-300'
                      }`}>
                      <div className="text-3xl mb-2">{type === 'B2C' ? '👤' : '🏢'}</div>
                      <div className="font-bold text-gray-800">{type}</div>
                      <div className="text-xs text-gray-500 mt-1">{type === 'B2C' ? 'Pessoa física — 1 veículo' : 'Empresa — frota de veículos'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Origem do Pedido</h3>
                <div className="grid grid-cols-1 gap-2">
                  {ORIGIN_TYPES.map((o) => (
                    <button key={o.value} onClick={() => setOriginType(o.value)}
                      className={`flex items-center gap-3 p-3 border-2 rounded-lg text-left transition-all ${
                        originType === o.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
                      }`}>
                      <span className="text-lg">{o.label.split(' ')[0]}</span>
                      <div>
                        <div className="font-semibold text-sm text-gray-700">{o.label.substring(o.label.indexOf(' ') + 1)}</div>
                        <div className="text-xs text-gray-400">{o.desc}</div>
                      </div>
                      {originType === o.value && <span className="ml-auto text-indigo-600 font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreateDraft} disabled={loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading ? 'Criando rascunho...' : 'Iniciar Pedido →'}
              </button>
            </div>
          )}

          {/* ── Step 1: Dados do cliente + endereço ──────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleClient} className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-1">👤 Dados do Cliente</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo de Pessoa</label>
                  <select value={client.clientType} onChange={(e) => setClient((c) => ({ ...c, clientType: e.target.value }))} className={inputCls}>
                    <option value="PF">Pessoa Física (CPF)</option>
                    <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{client.clientType === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                  <input required value={client.clientCpfCnpj} onChange={(e) => setClient((c) => ({ ...c, clientCpfCnpj: e.target.value }))}
                    className={inputCls} placeholder={client.clientType === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{client.clientType === 'PF' ? 'Nome Completo' : 'Razão Social'} *</label>
                <input required value={client.clientName} onChange={(e) => setClient((c) => ({ ...c, clientName: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Telefone / WhatsApp *</label>
                  <input required value={client.clientPhone} onChange={(e) => setClient((c) => ({ ...c, clientPhone: e.target.value }))}
                    className={inputCls} placeholder="(31) 9 9999-9999" />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input type="email" value={client.clientEmail} onChange={(e) => setClient((c) => ({ ...c, clientEmail: e.target.value }))}
                    className={inputCls} placeholder="cliente@empresa.com.br" />
                </div>
              </div>

              {/* Endereço ViaCEP */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                  <span>📍</span> Endereço <span className="text-xs font-normal text-gray-400">(preenchimento automático pelo CEP)</span>
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>CEP</label>
                    <input value={client.cep}
                      onChange={(e) => setClient((c) => ({ ...c, cep: e.target.value }))}
                      onBlur={(e) => lookupCep(e.target.value)}
                      className={inputCls} placeholder="00000-000" maxLength={9} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Logradouro</label>
                    <input value={client.logradouro} onChange={(e) => setClient((c) => ({ ...c, logradouro: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className={labelCls}>Nº</label>
                    <input value={client.numero} onChange={(e) => setClient((c) => ({ ...c, numero: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Compl.</label>
                    <input value={client.complemento} onChange={(e) => setClient((c) => ({ ...c, complemento: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Bairro</label>
                    <input value={client.bairro} onChange={(e) => setClient((c) => ({ ...c, bairro: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Cidade / UF</label>
                    <div className="flex gap-1">
                      <input value={client.cidade} onChange={(e) => setClient((c) => ({ ...c, cidade: e.target.value }))} className={inputCls} placeholder="Cidade" />
                      <input value={client.uf} onChange={(e) => setClient((c) => ({ ...c, uf: e.target.value.toUpperCase() }))} className={`${inputCls} w-14`} maxLength={2} placeholder="UF" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(0)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Veículo / Frota ───────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleVehicle} className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-1">
                {orderType === 'B2B' ? '🚚 Dados da Frota' : '🚗 Dados do Veículo'}
              </h3>
              {orderType === 'B2C' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Placa *</label>
                      <input required value={vehicle.plate}
                        onChange={(e) => setVehicle((v) => ({ ...v, plate: e.target.value.toUpperCase() }))}
                        className={`${inputCls} font-mono tracking-wider`} placeholder="ABC1D23" maxLength={8} />
                    </div>
                    <div>
                      <label className={labelCls}>Tipo de Veículo</label>
                      <select value={vehicle.vehicleType} onChange={(e) => setVehicle((v) => ({ ...v, vehicleType: e.target.value }))} className={inputCls}>
                        <option value="CARRO">🚗 Carro</option>
                        <option value="MOTO">🏍️ Moto</option>
                        <option value="CAMINHAO">🚛 Caminhão</option>
                        <option value="ONIBUS">🚌 Ônibus</option>
                        <option value="MAQUINA_AGRICOLA">🚜 Máquina Agrícola</option>
                        <option value="MAQUINA_MINERACAO">⛏️ Máquina Mineração</option>
                        <option value="OUTROS">📦 Outros</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Marca</label>
                      <input value={vehicle.vehicleBrand} onChange={(e) => setVehicle((v) => ({ ...v, vehicleBrand: e.target.value }))} className={inputCls} placeholder="Toyota, Ford..." />
                    </div>
                    <div>
                      <label className={labelCls}>Modelo</label>
                      <input value={vehicle.vehicleModel} onChange={(e) => setVehicle((v) => ({ ...v, vehicleModel: e.target.value }))} className={inputCls} placeholder="Hilux, Ranger..." />
                    </div>
                    <div>
                      <label className={labelCls}>Ano</label>
                      <input type="number" value={vehicle.vehicleYear}
                        onChange={(e) => setVehicle((v) => ({ ...v, vehicleYear: e.target.value }))}
                        className={inputCls} min={1990} max={new Date().getFullYear() + 1} placeholder="2024" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Número de Veículos *</label>
                      <input required type="number" value={vehicle.fleetSize}
                        onChange={(e) => setVehicle((v) => ({ ...v, fleetSize: e.target.value }))}
                        className={inputCls} min={1} placeholder="Ex: 50" />
                    </div>
                    <div>
                      <label className={labelCls}>Segmento de Atuação</label>
                      <select value={vehicle.segmento} onChange={(e) => setVehicle((v) => ({ ...v, segmento: e.target.value }))} className={inputCls}>
                        <option value="">Selecione...</option>
                        <option value="MINERACAO">⛏️ Mineração</option>
                        <option value="TRANSPORTE_CARGA">🚛 Transporte de Carga</option>
                        <option value="TRANSPORTE_PASSAGEIRO">🚌 Transporte de Passageiros</option>
                        <option value="AGRONEGOCIO">🌾 Agronegócio</option>
                        <option value="CONSTRUCAO">🏗️ Construção Civil</option>
                        <option value="LOGISTICA">📦 Logística</option>
                        <option value="ENERGIA">⚡ Energia</option>
                        <option value="SAUDE">🏥 Saúde</option>
                        <option value="OUTROS">📋 Outros</option>
                      </select>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    <strong>💡 Dica:</strong> Para frotas de mineração com mais de 100 veículos, considere o plano <strong>Topy Pro</strong> com câmera ADAS + DMS 360° e integração Vale.
                  </div>
                </>
              )}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Plano VAPEC ───────────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={handlePlan} className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">📋 Plano VAPEC 2026</h3>
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  {(['MONTHLY', 'ANNUAL'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setPlanType(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        planType === t ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      {t === 'MONTHLY' ? 'Mensal' : 'Anual'} {t === 'ANNUAL' && <span className="text-green-600 font-bold">−22%</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards de plano */}
              <div className="grid grid-cols-3 gap-3">
                {VAPEC_PLANS.map((plan) => {
                  const price = planType === 'MONTHLY' ? plan.monthlyPrice : plan.annualPrice
                  const isSelected = selectedPlanId === plan.id
                  const colorCls = PLAN_COLOR[plan.color]
                  return (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative p-4 border-2 rounded-xl text-left transition-all ${
                        isSelected ? `${colorCls} ring-2 ring-offset-1 shadow-md` : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      {plan.badge && (
                        <span className={`absolute -top-2 right-2 px-2 py-0.5 rounded-full text-white text-[10px] font-bold ${PLAN_BTN[plan.color]}`}>
                          {plan.badge}
                        </span>
                      )}
                      <div className="text-2xl mb-1">{plan.icon}</div>
                      <div className="font-bold text-gray-800 text-sm">{plan.name}</div>
                      <div className="text-xs text-gray-500 mb-2">{plan.ideal}</div>
                      <div className="font-bold text-lg text-gray-900">
                        {fmt(price)}
                        <span className="text-xs text-gray-400 font-normal">/{planType === 'MONTHLY' ? 'mês' : 'ano'}</span>
                      </div>
                      {planType === 'ANNUAL' && (
                        <div className="text-xs text-green-600 font-semibold mt-0.5">Economia de {fmt(plan.annualSaving)}/ano</div>
                      )}
                      {isSelected && (
                        <div className="mt-2 space-y-0.5">
                          {plan.features.slice(0, 3).map((f) => (
                            <div key={f} className="flex items-center gap-1 text-xs text-gray-600">
                              <span className="text-green-500">✓</span> {f}
                            </div>
                          ))}
                          {plan.features.length > 3 && (
                            <div className="text-xs text-gray-400">+{plan.features.length - 3} recursos...</div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Pagamento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Forma de Pagamento</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                    <option value="PIX">⚡ PIX (0,99%)</option>
                    <option value="CREDIT_CARD">💳 Cartão de Crédito</option>
                    <option value="BOLETO">📄 Boleto Bancário</option>
                    <option value="DINHEIRO">💵 Dinheiro</option>
                    <option value="TRANSFERENCIA">🏦 Transferência</option>
                  </select>
                </div>
                {paymentMethod === 'CREDIT_CARD' && (
                  <div>
                    <label className={labelCls}>Parcelas</label>
                    <select value={installments} onChange={(e) => setInstallments(e.target.value)} className={inputCls}>
                      {[1,2,3,6,12].map((n) => (
                        <option key={n} value={n}>{n}× {n === 1 ? '(à vista)' : `de ${fmt(netPrice / n)}`}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Desconto (R$)</label>
                  <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                    className={inputCls} min={0} max={basePrice} step={0.01} placeholder="0,00" />
                </div>
              </div>

              {/* Resumo do valor */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Valor bruto ({planType === 'MONTHLY' ? 'mensal' : 'anual'}):</span>
                  <span>{fmt(basePrice)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Desconto:</span>
                    <span>− {fmt(discountNum)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t pt-2">
                  <span>Valor Líquido (base de comissão):</span>
                  <span className="text-indigo-700">{fmt(netPrice)}</span>
                </div>
                <div className="text-xs text-gray-400">
                  Comissão Motor 1: {Math.round(netPrice * 0.10)}-{Math.round(netPrice * 0.25)} R$ (10-25% escalonado)
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 4: Confirmar ──────────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-1">✅ Confirmar Pedido</h3>
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="text-gray-500">Número do Pedido</div>
                  <div className="font-mono font-bold text-indigo-700">#{orderNumber}</div>
                  <div className="text-gray-500">Tipo</div>
                  <div className="font-semibold">{orderType === 'B2C' ? '👤 B2C (Pessoa Física)' : '🏢 B2B (Empresa/Frota)'}</div>
                  <div className="text-gray-500">Origem</div>
                  <div className="font-semibold">{ORIGIN_TYPES.find((o) => o.value === originType)?.label ?? originType}</div>
                  <div className="text-gray-500">Cliente</div>
                  <div className="font-semibold">{client.clientName || '—'}</div>
                  {orderType === 'B2C' && vehicle.plate && (
                    <>
                      <div className="text-gray-500">Placa</div>
                      <div className="font-mono font-bold">{vehicle.plate}</div>
                    </>
                  )}
                  {orderType === 'B2B' && vehicle.fleetSize && (
                    <>
                      <div className="text-gray-500">Frota</div>
                      <div className="font-semibold">{vehicle.fleetSize} veículos — {vehicle.segmento || 'Segmento não informado'}</div>
                    </>
                  )}
                  <div className="text-gray-500">Plano</div>
                  <div className="font-semibold">{selectedPlan?.icon} {selectedPlan?.name} ({planType === 'MONTHLY' ? 'Mensal' : 'Anual'})</div>
                  <div className="text-gray-500">Pagamento</div>
                  <div className="font-semibold">{paymentMethod}</div>
                </div>
                <div className="border-t border-indigo-100 pt-3 flex justify-between items-center">
                  <span className="text-gray-500">Valor Líquido (base comissão):</span>
                  <span className="text-xl font-bold text-indigo-700">{fmt(netPrice)}</span>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex gap-2">
                <span className="text-lg leading-none">⚙️</span>
                <div>Ao confirmar, o status muda para <strong>PENDING</strong> e as comissões serão geradas automaticamente pelos Motores 1–4 da política VAPEC 2026 v1.4.</div>
              </div>
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(3)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Voltar</button>
                <button onClick={handleConfirm} disabled={loading}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 shadow-sm">
                  {loading ? 'Confirmando...' : '✅ Confirmar e Gerar Comissões'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PedidosPage() {
  const [orders, setOrders]           = useState<Order[]>([])
  const [stats, setStats]             = useState<OrderStats | null>(null)
  const [loading, setLoading]         = useState(true)
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [pages, setPages]             = useState(1)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter]   = useState('')
  const [showWizard, setShowWizard]   = useState(false)
  const [cancelModal, setCancelModal] = useState<{ id: string; number: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('orderType', typeFilter)

      const [ordersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/orders?${params}`).then((r) => r.json()),
        fetch('/api/admin/orders?stats=true').then((r) => r.json()),
      ])
      setOrders(ordersRes.items ?? [])
      setTotal(ordersRes.total ?? 0)
      setPages(ordersRes.pages ?? 1)
      setStats(statsRes.stats ?? null)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [page, search, statusFilter, typeFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleCancelOrder = async () => {
    if (!cancelModal || cancelReason.trim().length < 5) return
    setCancelLoading(true)
    try {
      await fetch(`/api/admin/orders/${cancelModal.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      })
      setCancelModal(null); setCancelReason(''); fetchOrders()
    } catch (e) { console.error(e) }
    finally { setCancelLoading(false) }
  }

  const totalRevenue = stats?.totalRevenue ?? 0
  const activeCount  = stats?.byStatus?.ACTIVE ?? 0
  const pendingCount = stats?.byStatus?.PENDING ?? 0
  const draftCount   = stats?.byStatus?.DRAFT ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📦 Pedidos B2B/B2C</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} pedido{total !== 1 ? 's' : ''} — lojas próprias, franqueados, parceiros diamante e promotoras
          </p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
          <span className="text-lg">+</span> Novo Pedido
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Receita Líquida</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{fmt(totalRevenue)}</div>
          <div className="text-xs text-gray-400 mt-1">base de comissão</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Ativos</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{activeCount}</div>
          <div className="text-xs text-gray-400 mt-1">contratos vigentes</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Pendentes</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</div>
          <div className="text-xs text-gray-400 mt-1">aguardando pagamento</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Rascunhos</div>
          <div className="text-2xl font-bold text-gray-600 mt-1">{draftCount}</div>
          <div className="text-xs text-gray-400 mt-1">em preenchimento</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="🔍 Número, cliente, placa..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Todos os Status</option>
            {Object.entries(STATUS_LABELS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">B2B + B2C</option>
            <option value="B2C">👤 B2C</option>
            <option value="B2B">🏢 B2B</option>
          </select>
          <button onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setPage(1) }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            ✕ Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mr-3" />
            Carregando pedidos...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📦</div>
            <p className="font-semibold text-gray-500">Nenhum pedido encontrado</p>
            <p className="text-sm mt-1">Clique em "Novo Pedido" para começar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Promotor / PDV</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Líquido</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => {
                const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-indigo-700 text-xs">{order.orderNumber}</div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {order.orderType === 'B2C' ? '👤' : '🏢'} {order.orderType} · {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{order.clientName ?? '—'}</div>
                      <div className="text-gray-400 text-xs">{fmtDoc(order.clientCpfCnpj)}</div>
                      {order.plate && (
                        <span className="inline-block text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-0.5">{order.plate}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600">{order.planName ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-gray-600 text-xs">{order.promoter?.nome ?? '—'}</div>
                      {order.pdv && <div className="text-gray-400 text-xs">{order.pdv.name}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold text-gray-900">{fmt(order.netValue)}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {['DRAFT', 'PENDING'].includes(order.status) && (
                        <button onClick={() => setCancelModal({ id: order.id, number: order.orderNumber })}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline">
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">{total} pedidos · Página {page}/{pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">Próxima →</button>
            </div>
          </div>
        )}
      </div>

      {showWizard && <OrderWizard onClose={() => setShowWizard(false)} onSuccess={() => { setShowWizard(false); fetchOrders() }} />}

      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-1">Cancelar Pedido</h3>
            <p className="text-sm text-gray-500 mb-1">#{cancelModal.number}</p>
            <p className="text-sm text-gray-500 mb-4">Informe o motivo. Se o pedido tiver menos de 7 dias, as comissões serão glosadas automaticamente.</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (mínimo 5 caracteres)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setCancelModal(null); setCancelReason('') }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Desistir</button>
              <button onClick={handleCancelOrder} disabled={cancelLoading || cancelReason.trim().length < 5}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-red-700">
                {cancelLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
