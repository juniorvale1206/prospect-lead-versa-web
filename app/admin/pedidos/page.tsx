'use client'

/**
 * Página de Gestão de Pedidos B2B/B2C — ProspecLead Admin
 *
 * Funcionalidades:
 *  - Listagem com filtros (status, tipo, busca)
 *  - Cards de KPIs (total, por status, receita líquida)
 *  - Wizard de criação inline (4 etapas)
 *  - Detalhes do pedido em modal
 *  - Cancelamento com motivo
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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
  recentOrders: Order[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
  COMPLETED: { label: 'Concluído', color: 'bg-blue-100 text-blue-700' },
}

const TYPE_LABELS: Record<string, string> = {
  B2C: '👤 B2C',
  B2B: '🏢 B2B',
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCpfCnpj(doc: string | null) {
  if (!doc) return '—'
  const clean = doc.replace(/\D/g, '')
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

// ─── Componente Wizard ────────────────────────────────────────────────────────
function OrderWizard({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState(0)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Etapa 0: tipo do pedido
  const [orderType, setOrderType] = useState<'B2C' | 'B2B'>('B2C')

  // Etapa 1: cliente
  const [client, setClient] = useState({
    clientName: '', clientCpfCnpj: '', clientPhone: '', clientEmail: '',
    clientType: 'PF', cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '',
  })

  // Etapa 2: veículo
  const [vehicle, setVehicle] = useState({
    plate: '', vehicleBrand: '', vehicleModel: '', vehicleYear: '',
    vehicleType: 'CARRO', fleetSize: '', segmento: '',
  })

  // Etapa 3: plano
  const [plan, setPlan] = useState({
    productId: '', planType: 'MONTHLY', discountValue: '0', paymentMethod: 'PIX', installments: '1',
  })
  const [products, setProducts] = useState<Array<{ id: string; name: string; price: number; type: string }>>([])

  useEffect(() => {
    fetch('/api/admin/produtos?limit=50')
      .then((r) => r.json())
      .then((data) => setProducts(data.items ?? data ?? []))
      .catch(() => {})
  }, [])

  // Etapa 0: Criar DRAFT
  const handleCreateDraft = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar pedido')
      setOrderId(data.id)
      setOrderNumber(data.orderNumber)
      setStep(1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  // Etapa 1: Vincular cliente + CEP auto
  const lookupCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setClient((c) => ({
          ...c,
          logradouro: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade,
          uf: data.uf,
        }))
      }
    } catch {}
  }

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'client', ...client }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setStep(2)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  const handleVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) return
    setLoading(true)
    setError('')
    try {
      const payload =
        orderType === 'B2B'
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'plan',
          ...plan,
          discountValue: parseFloat(plan.discountValue) || 0,
          installments: parseInt(plan.installments) || 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setStep(4)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!orderId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'confirm' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase mb-1'

  const steps = ['Tipo', 'Cliente', orderType === 'B2B' ? 'Frota' : 'Veículo', 'Plano', 'Confirmar']

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Novo Pedido</h2>
              {orderNumber && <p className="text-blue-200 text-sm">#{orderNumber}</p>}
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl">×</button>
          </div>
          {/* Progress steps */}
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${
                  i < step ? 'bg-green-400 text-white' : i === step ? 'bg-white text-blue-600' : 'bg-blue-500 text-blue-200'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`ml-1 text-xs hidden sm:block ${i === step ? 'text-white' : 'text-blue-300'}`}>{s}</span>
                {i < steps.length - 1 && <div className="flex-1 h-px bg-blue-400 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Etapa 0: Tipo do pedido */}
          {step === 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Tipo do Pedido</h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {(['B2C', 'B2B'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`p-6 border-2 rounded-xl text-center transition-all ${
                      orderType === type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="text-3xl mb-2">{type === 'B2C' ? '👤' : '🏢'}</div>
                    <div className="font-bold text-gray-800">{type}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {type === 'B2C' ? 'Pessoa Física — 1 veículo' : 'Empresa — Frota de veículos'}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreateDraft}
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Criando...' : 'Iniciar Pedido →'}
              </button>
            </div>
          )}

          {/* Etapa 1: Dados do cliente */}
          {step === 1 && (
            <form onSubmit={handleClientSubmit} className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-2">👤 Dados do Cliente</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select value={client.clientType} onChange={(e) => setClient((c) => ({ ...c, clientType: e.target.value }))} className={inputCls}>
                    <option value="PF">Pessoa Física (CPF)</option>
                    <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{client.clientType === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                  <input required value={client.clientCpfCnpj} onChange={(e) => setClient((c) => ({ ...c, clientCpfCnpj: e.target.value }))} className={inputCls} placeholder={client.clientType === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{client.clientType === 'PF' ? 'Nome Completo' : 'Razão Social'} *</label>
                <input required value={client.clientName} onChange={(e) => setClient((c) => ({ ...c, clientName: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Telefone *</label>
                  <input required value={client.clientPhone} onChange={(e) => setClient((c) => ({ ...c, clientPhone: e.target.value }))} className={inputCls} placeholder="31999999999" />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input type="email" value={client.clientEmail} onChange={(e) => setClient((c) => ({ ...c, clientEmail: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold text-gray-600 mb-3">📍 Endereço (ViaCEP)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>CEP</label>
                    <input value={client.cep} onChange={(e) => setClient((c) => ({ ...c, cep: e.target.value }))} onBlur={(e) => lookupCep(e.target.value)} className={inputCls} placeholder="00000000" maxLength={9} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Logradouro</label>
                    <input value={client.logradouro} onChange={(e) => setClient((c) => ({ ...c, logradouro: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className={labelCls}>Número</label>
                    <input value={client.numero} onChange={(e) => setClient((c) => ({ ...c, numero: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Bairro</label>
                    <input value={client.bairro} onChange={(e) => setClient((c) => ({ ...c, bairro: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Cidade</label>
                    <input value={client.cidade} onChange={(e) => setClient((c) => ({ ...c, cidade: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>UF</label>
                    <input value={client.uf} onChange={(e) => setClient((c) => ({ ...c, uf: e.target.value }))} className={inputCls} maxLength={2} />
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(0)} className="px-4 py-2 border rounded-lg text-sm">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* Etapa 2: Veículo / Frota */}
          {step === 2 && (
            <form onSubmit={handleVehicleSubmit} className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-2">
                {orderType === 'B2B' ? '🚚 Dados da Frota' : '🚗 Dados do Veículo'}
              </h3>
              {orderType === 'B2C' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Placa *</label>
                      <input required value={vehicle.plate} onChange={(e) => setVehicle((v) => ({ ...v, plate: e.target.value.toUpperCase() }))} className={inputCls} placeholder="ABC1234 ou ABC1D23" maxLength={8} />
                    </div>
                    <div>
                      <label className={labelCls}>Tipo de Veículo</label>
                      <select value={vehicle.vehicleType} onChange={(e) => setVehicle((v) => ({ ...v, vehicleType: e.target.value }))} className={inputCls}>
                        <option value="CARRO">Carro</option>
                        <option value="MOTO">Moto</option>
                        <option value="CAMINHAO">Caminhão</option>
                        <option value="ONIBUS">Ônibus</option>
                        <option value="MAQUINA_AGRICOLA">Máquina Agrícola</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Marca</label>
                      <input value={vehicle.vehicleBrand} onChange={(e) => setVehicle((v) => ({ ...v, vehicleBrand: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Modelo</label>
                      <input value={vehicle.vehicleModel} onChange={(e) => setVehicle((v) => ({ ...v, vehicleModel: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Ano</label>
                      <input type="number" value={vehicle.vehicleYear} onChange={(e) => setVehicle((v) => ({ ...v, vehicleYear: e.target.value }))} className={inputCls} min={1990} max={new Date().getFullYear() + 1} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Número de Veículos *</label>
                      <input required type="number" value={vehicle.fleetSize} onChange={(e) => setVehicle((v) => ({ ...v, fleetSize: e.target.value }))} className={inputCls} min={1} />
                    </div>
                    <div>
                      <label className={labelCls}>Segmento</label>
                      <select value={vehicle.segmento} onChange={(e) => setVehicle((v) => ({ ...v, segmento: e.target.value }))} className={inputCls}>
                        <option value="">Selecione...</option>
                        <option value="MINERACAO">Mineração</option>
                        <option value="TRANSPORTE_CARGA">Transporte de Carga</option>
                        <option value="TRANSPORTE_PASSAGEIRO">Transporte de Passageiros</option>
                        <option value="AGRONEGOCIO">Agronegócio</option>
                        <option value="CONSTRUCAO">Construção Civil</option>
                        <option value="LOGISTICA">Logística</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 border rounded-lg text-sm">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* Etapa 3: Plano */}
          {step === 3 && (
            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-2">📋 Plano e Valores</h3>
              <div>
                <label className={labelCls}>Produto / Plano *</label>
                <select required value={plan.productId} onChange={(e) => setPlan((p) => ({ ...p, productId: e.target.value }))} className={inputCls}>
                  <option value="">Selecione um plano...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(p.price)}/mês
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Ciclo</label>
                  <select value={plan.planType} onChange={(e) => setPlan((p) => ({ ...p, planType: e.target.value }))} className={inputCls}>
                    <option value="MONTHLY">Mensal</option>
                    <option value="ANNUAL">Anual</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Forma de Pagamento</label>
                  <select value={plan.paymentMethod} onChange={(e) => setPlan((p) => ({ ...p, paymentMethod: e.target.value }))} className={inputCls}>
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="DINHEIRO">Dinheiro</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Desconto (R$)</label>
                  <input type="number" value={plan.discountValue} onChange={(e) => setPlan((p) => ({ ...p, discountValue: e.target.value }))} className={inputCls} min={0} step={0.01} />
                </div>
                <div>
                  <label className={labelCls}>Parcelas</label>
                  <input type="number" value={plan.installments} onChange={(e) => setPlan((p) => ({ ...p, installments: e.target.value }))} className={inputCls} min={1} max={12} />
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 border rounded-lg text-sm">← Voltar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </form>
          )}

          {/* Etapa 4: Confirmar */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-2">✅ Confirmar Pedido</h3>
              <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Número do Pedido:</span>
                  <strong className="text-blue-700">#{orderNumber}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo:</span>
                  <strong>{orderType}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente:</span>
                  <strong>{client.clientName}</strong>
                </div>
                {orderType === 'B2C' && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Placa:</span>
                    <strong>{vehicle.plate || '—'}</strong>
                  </div>
                )}
                {orderType === 'B2B' && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Frota:</span>
                    <strong>{vehicle.fleetSize} veículos</strong>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-500">Comissões:</span>
                  <strong className="text-green-600">Serão calculadas automaticamente</strong>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                <strong>⚠️ Atenção:</strong> Ao confirmar, o pedido mudará para PENDING e as comissões serão geradas automaticamente pelos Motores 1-4 da política VAPEC 2026.
              </div>
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(3)} className="px-4 py-2 border rounded-lg text-sm">← Voltar</button>
                <button onClick={handleConfirm} disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm disabled:opacity-50">
                  {loading ? 'Confirmando...' : '✅ Confirmar Pedido'}
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
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showWizard, setShowWizard] = useState(false)
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, typeFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleCancelOrder = async () => {
    if (!cancelModal || cancelReason.trim().length < 5) return
    setCancelLoading(true)
    try {
      await fetch(`/api/admin/orders/${cancelModal.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      })
      setCancelModal(null)
      setCancelReason('')
      fetchOrders()
    } catch (e) {
      console.error(e)
    } finally {
      setCancelLoading(false)
    }
  }

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
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          <span>+</span> Novo Pedido
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-500 uppercase font-semibold">Receita Líquida</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(stats.totalRevenue)}</div>
          </div>
          {Object.entries(STATUS_LABELS).map(([status, { label, color }]) => (
            <div key={status} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="text-xs text-gray-500 uppercase font-semibold">{label}</div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{stats.byStatus[status] ?? 0}</div>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por número, cliente, placa..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">Todos os Status</option>
            {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">B2B + B2C</option>
            <option value="B2C">👤 B2C</option>
            <option value="B2B">🏢 B2B</option>
          </select>
          <button onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setPage(1) }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
            Carregando pedidos...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-medium">Nenhum pedido encontrado</p>
            <p className="text-sm">Crie o primeiro pedido clicando em "Novo Pedido"</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Promotor</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor Líquido</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => {
                const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-blue-700 text-xs">{order.orderNumber}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{TYPE_LABELS[order.orderType]} · {new Date(order.createdAt).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{order.clientName ?? '—'}</div>
                      <div className="text-gray-400 text-xs">{formatCpfCnpj(order.clientCpfCnpj)}</div>
                      {order.plate && <div className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-0.5">{order.plate}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-gray-700">{order.planName ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-gray-600 text-xs">{order.promoter?.nome ?? '—'}</div>
                      {order.pdv && <div className="text-gray-400 text-xs">{order.pdv.name} ({order.pdv.category})</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold text-gray-900">{formatCurrency(order.netValue)}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(order.status === 'DRAFT' || order.status === 'PENDING') && (
                        <button
                          onClick={() => setCancelModal({ id: order.id, number: order.orderNumber })}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
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

        {/* Paginação */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">{total} pedidos · Página {page} de {pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border rounded disabled:opacity-40">← Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Próxima →</button>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <OrderWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => { setShowWizard(false); fetchOrders() }}
        />
      )}

      {/* Modal de Cancelamento */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-2">Cancelar Pedido #{cancelModal.number}</h3>
            <p className="text-sm text-gray-500 mb-4">Informe o motivo do cancelamento. Se o pedido tiver menos de 7 dias, as comissões serão estornadas automaticamente.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (mínimo 5 caracteres)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setCancelModal(null); setCancelReason('') }} className="flex-1 px-4 py-2 border rounded-lg text-sm">Desistir</button>
              <button onClick={handleCancelOrder} disabled={cancelLoading || cancelReason.trim().length < 5} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm disabled:opacity-50">
                {cancelLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
