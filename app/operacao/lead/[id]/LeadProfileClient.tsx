'use client'

import {
  useState,
  useEffect,
  useCallback,
} from 'react'
import { useRouter } from 'next/navigation'
import WidgetVoiceCall from '@/components/voice/WidgetVoiceCall'
import {
  ArrowLeft,
  Building2,
  Car,
  MapPin,
  Phone,
  Mail,
  User,
  Briefcase,
  Hash,
  Truck,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  FileText,
  Edit3,
  Save,
  X,
  Loader2,
  BadgeCheck,
  Layers,
  Star,
  Thermometer,
  Bot,
  ShoppingBag,
  ClipboardList,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type FunnelStage = 'LEAD_COLETADO' | 'IA_EM_ATENDIMENTO' | 'REUNIAO_AGENDADA' | 'CONVERTIDO'
type LeadType    = 'B2C' | 'B2B'

interface Task {
  id:      string
  title:   string
  status:  string
  dueDate: string | null
  type:    string
  priority: string
  user:    { id: string; nome: string } | null
}

interface Sale {
  id:         string
  totalAmount: number
  paymentMethod: string
  createdAt:  string
  product:    { name: string; type: string }
}

interface Lead {
  id:               string
  leadType:         LeadType
  nomeCliente:      string
  telefone:         string | null
  email:            string | null
  veiculo:          string
  placa:            string
  praca:            string
  cnpj:             string | null
  empresaNome:      string | null
  frota:            string | null
  segmento:         string | null
  razaoSocial:      string | null
  doresIdentificadas: string | null
  funnelStage:      FunnelStage
  iaStatus:         string | null
  status:           string
  sourceType:       string
  cnae:             string | null
  cnaeDescricao:    string | null
  porte:            string | null
  logradouro:       string | null
  numero:           string | null
  complemento:      string | null
  bairro:           string | null
  municipio:        string | null
  uf:               string | null
  cep:              string | null
  commissionValue:  number
  createdAt:        string
  updatedAt:        string
  tenant:           { id: string; nome: string; slug: string; primaryColor: string } | null
  promotor:         { id: string; nome: string; email: string } | null
  auditadoPor:      { id: string; nome: string } | null
  tasks:            Task[]
  sales:            Sale[]
  callLogs?:        Array<{ id: string }>
}

interface Props {
  leadId:   string
  userRole: string
  userName: string
  tenantId: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const FUNNEL_STAGES: {
  key:    FunnelStage
  label:  string
  icon:   string
  color:  string
  bg:     string
  dot:    string
}[] = [
  { key: 'LEAD_COLETADO',      label: 'Lead Coletado',      icon: '📥', color: 'text-slate-600',   bg: 'bg-slate-100',   dot: 'bg-slate-400' },
  { key: 'IA_EM_ATENDIMENTO',  label: 'IA Atendendo',       icon: '🤖', color: 'text-blue-600',    bg: 'bg-blue-100',    dot: 'bg-blue-500'  },
  { key: 'REUNIAO_AGENDADA',   label: 'Reunião Agendada',   icon: '📅', color: 'text-emerald-600', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  { key: 'CONVERTIDO',         label: 'Convertido',         icon: '🏆', color: 'text-yellow-600',  bg: 'bg-yellow-100',  dot: 'bg-yellow-500' },
]

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:     { label: 'Pendente',    color: 'text-amber-600 bg-amber-50 border-amber-200' },
  IN_PROGRESS: { label: 'Em progresso',color: 'text-blue-600 bg-blue-50 border-blue-200' },
  COMPLETED:   { label: 'Concluída',   color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  CANCELED:    { label: 'Cancelada',   color: 'text-slate-500 bg-slate-50 border-slate-200' },
}

const TASK_TYPE_ICON: Record<string, string> = {
  CALL:      '📞',
  EMAIL:     '📧',
  WHATSAPP:  '💬',
  MEETING:   '📅',
  FOLLOW_UP: '🔄',
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function fmtCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function maskCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION CARD
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children, action }: {
  title:    string
  icon:     React.FC<{ className?: string }>
  children: React.ReactNode
  action?:  React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4.5 h-4.5 text-slate-600" />
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-slate-400 w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 flex-1 ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-slate-300 italic">—</span>}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLIENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LeadProfileClient({ leadId, userRole, userName, tenantId }: Props) {
  const router   = useRouter()
  const [lead, setLead]       = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [editForm, setEditForm] = useState<Partial<Lead>>({})
  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'sales' | 'calls'>('info')
  const [toast, setToast]     = useState<{ type: 'success'|'error'; msg: string } | null>(null)

  // ── Fetch lead ──────────────────────────────────────────────
  const fetchLead = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leads/${leadId}`)
      if (!r.ok) {
        const d = await r.json() as { error?: string }
        throw new Error(d.error ?? 'Erro ao buscar lead')
      }
      const d = await r.json() as { lead: Lead }
      setLead(d.lead)
      setEditForm(d.lead)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => { fetchLead() }, [fetchLead])

  // ── Toast ──
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Save edits ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!lead) return
    setSaving(true)
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editForm),
      })
      if (!r.ok) throw new Error('Erro ao salvar')
      await fetchLead()
      setEditing(false)
      setToast({ type: 'success', msg: 'Dados atualizados com sucesso!' })
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Erro' })
    } finally {
      setSaving(false)
    }
  }

  // ── Update funnel stage ─────────────────────────────────────
  const handleStageChange = async (stage: FunnelStage) => {
    if (!lead) return
    try {
      await fetch(`/api/leads/${leadId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ funnelStage: stage }),
      })
      setLead(l => l ? { ...l, funnelStage: stage } : l)
      setToast({ type: 'success', msg: `Estágio atualizado: ${FUNNEL_STAGES.find(s => s.key === stage)?.label}` })
    } catch {
      setToast({ type: 'error', msg: 'Erro ao atualizar estágio' })
    }
  }

  // ── Loading / error ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-slate-700 font-medium">{error ?? 'Lead não encontrado'}</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-emerald-600 hover:underline"
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  const isB2B     = lead.leadType === 'B2B'
  const stage     = FUNNEL_STAGES.find(s => s.key === lead.funnelStage) ?? FUNNEL_STAGES[0]
  const stageIdx  = FUNNEL_STAGES.findIndex(s => s.key === lead.funnelStage)

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">
              {lead.nomeCliente}
            </h1>
            <p className="text-sm text-slate-500">
              {isB2B ? lead.empresaNome ?? 'Empresa não informada' : `${lead.veiculo || 'Veículo'} • ${lead.placa || 'Sem placa'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setEditing(false); setEditForm(lead) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 text-sm transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Hero Card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div
            className="h-24 relative"
            style={{ background: `linear-gradient(135deg, ${lead.tenant?.primaryColor ?? '#10b981'}, ${lead.tenant?.primaryColor ?? '#10b981'}cc)` }}
          >
            <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10" />
          </div>
          <div className="px-6 pb-5 -mt-12">
            <div className="flex items-end gap-4 mb-4">
              <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-2xl font-bold bg-white"
                style={{ color: lead.tenant?.primaryColor ?? '#10b981' }}>
                {lead.nomeCliente.charAt(0).toUpperCase()}
              </div>
              <div className="mb-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${stage.bg} ${stage.color}`}>
                    {stage.icon} {stage.label}
                  </span>
                  <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                    isB2B ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {isB2B ? '🏭 B2B' : '🚗 B2C'}
                  </span>
                  {lead.iaStatus && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      <Bot className="w-3 h-3" /> IA: {lead.iaStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Funil progress */}
            <div className="flex items-center gap-1 mt-2">
              {FUNNEL_STAGES.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => handleStageChange(s.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-center transition-all hover:opacity-80 ${
                    i === stageIdx ? `${s.bg} ${s.color} ring-1 ring-current` : 'opacity-40'
                  }`}
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="text-[10px] font-medium hidden sm:block leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT (2 cols) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Sub-tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-200 overflow-x-auto">
                {[
                  { key: 'info',  label: 'Dados',      icon: FileText },
                  { key: 'tasks', label: `Tarefas (${lead.tasks?.length ?? 0})`, icon: ClipboardList },
                  { key: 'sales', label: `Vendas (${lead.sales?.length ?? 0})`,  icon: ShoppingBag },
                  { key: 'calls', label: 'Ligações IA', icon: Phone },
                ] .map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as typeof activeTab)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                      activeTab === t.key
                        ? 'text-emerald-700 border-emerald-600 bg-emerald-50'
                        : 'text-slate-500 border-transparent hover:text-slate-700'
                    }`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5">

                {/* ── TAB: INFO ── */}
                {activeTab === 'info' && (
                  <div className="space-y-6">
                    {/* Contato */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Contato
                      </h4>
                      {editing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { key: 'nomeCliente', label: 'Nome', type: 'text' },
                            { key: 'telefone',    label: 'Telefone', type: 'tel' },
                            { key: 'email',       label: 'E-mail',   type: 'email' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                              <input
                                type={f.type}
                                value={(editForm[f.key as keyof Lead] as string) ?? ''}
                                onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          <InfoRow label="Nome"    value={lead.nomeCliente} />
                          <InfoRow label="Telefone" value={lead.telefone} />
                          <InfoRow label="E-mail"   value={lead.email} />
                        </div>
                      )}
                    </div>

                    {/* B2B Fields */}
                    {isB2B && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" /> Empresa
                        </h4>
                        {editing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { key: 'empresaNome', label: 'Nome empresa' },
                              { key: 'cnpj',        label: 'CNPJ' },
                              { key: 'frota',       label: 'Tamanho da frota' },
                              { key: 'segmento',    label: 'Segmento' },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                                <input
                                  type="text"
                                  value={(editForm[f.key as keyof Lead] as string) ?? ''}
                                  onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            <InfoRow label="Empresa"       value={lead.empresaNome} />
                            <InfoRow label="Razão Social"  value={lead.razaoSocial} />
                            <InfoRow label="CNPJ"          value={lead.cnpj ? maskCnpj(lead.cnpj) : null} mono />
                            <InfoRow label="Frota"         value={lead.frota ? `${lead.frota} veículos` : null} />
                            <InfoRow label="Segmento"      value={lead.segmento} />
                            <InfoRow label="CNAE"          value={lead.cnaeDescricao ?? lead.cnae} />
                            <InfoRow label="Porte"         value={lead.porte} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* B2C Fields */}
                    {!isB2B && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5" /> Veículo
                        </h4>
                        {editing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { key: 'veiculo', label: 'Veículo' },
                              { key: 'placa',   label: 'Placa', mono: true },
                              { key: 'praca',   label: 'Praça' },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                                <input
                                  type="text"
                                  value={(editForm[f.key as keyof Lead] as string) ?? ''}
                                  onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                  className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${'mono' in f && f.mono ? 'font-mono uppercase' : ''}`}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            <InfoRow label="Veículo" value={lead.veiculo || null} />
                            <InfoRow label="Placa"   value={lead.placa || null}   mono />
                            <InfoRow label="Praça"   value={lead.praca || null} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Endereço */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Localização
                      </h4>
                      <div className="divide-y divide-slate-50">
                        <InfoRow label="Logradouro" value={[lead.logradouro, lead.numero].filter(Boolean).join(', ')} />
                        <InfoRow label="Complemento" value={lead.complemento} />
                        <InfoRow label="Bairro"     value={lead.bairro} />
                        <InfoRow label="Cidade/UF"  value={[lead.municipio, lead.uf].filter(Boolean).join(' - ')} />
                        <InfoRow label="CEP"        value={lead.cep} mono />
                      </div>
                    </div>

                    {/* Dores/Qualificação */}
                    {lead.doresIdentificadas && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Thermometer className="w-3.5 h-3.5" /> Dores Identificadas
                        </h4>
                        <p className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4 leading-relaxed">
                          {lead.doresIdentificadas}
                        </p>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                        <div>
                          <span className="font-medium">Origem:</span> {lead.sourceType}
                        </div>
                        <div>
                          <span className="font-medium">Status:</span> {lead.status}
                        </div>
                        <div>
                          <span className="font-medium">Criado em:</span> {fmtDate(lead.createdAt)}
                        </div>
                        <div>
                          <span className="font-medium">Atualizado:</span> {fmtDate(lead.updatedAt)}
                        </div>
                        {lead.promotor && (
                          <div className="col-span-2">
                            <span className="font-medium">Promotor:</span> {lead.promotor.nome} ({lead.promotor.email})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB: TASKS ── */}
                {activeTab === 'tasks' && (
                  <div className="space-y-3">
                    {lead.tasks.length === 0 && (
                      <div className="text-center py-8">
                        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Nenhuma tarefa criada</p>
                      </div>
                    )}
                    {lead.tasks.map(task => {
                      const ts = TASK_STATUS[task.status] ?? TASK_STATUS.PENDING
                      return (
                        <div key={task.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-start gap-3">
                          <span className="text-lg flex-shrink-0 mt-0.5">
                            {TASK_TYPE_ICON[task.type] ?? '📌'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-slate-800 text-sm">{task.title}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${ts.color}`}>
                                {ts.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              {task.dueDate && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3" />
                                  {fmtDate(task.dueDate)}
                                </span>
                              )}
                              {task.user && (
                                <span className="flex items-center gap-0.5">
                                  <User className="w-3 h-3" />
                                  {task.user.nome}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── TAB: SALES ── */}
                {activeTab === 'sales' && (
                  <div className="space-y-3">
                    {lead.sales.length === 0 && (
                      <div className="text-center py-8">
                        <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Nenhuma venda registrada</p>
                      </div>
                    )}
                    {lead.sales.map(sale => (
                      <div key={sale.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{sale.product.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{sale.product.type} • {sale.paymentMethod}</p>
                          </div>
                          <p className="font-bold text-emerald-700 text-sm">{fmtCurrency(sale.totalAmount)}</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">{fmtDate(sale.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── TAB: CALLS ── */}
                {activeTab === 'calls' && (
                  <div className="text-center py-4 text-sm text-slate-500">
                    <p>Veja o widget ao lado para o histórico completo de ligações IA.</p>
                    <button
                      onClick={() => setActiveTab('info')}
                      className="mt-2 text-emerald-600 hover:underline text-xs"
                    >
                      ← Voltar para dados
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT (1 col) — Widget Voice + Cards */}
          <div className="space-y-6">

            {/* Voice AI Widget */}
            <WidgetVoiceCall
              lead={{
                id:          lead.id,
                nomeCliente: lead.nomeCliente,
                telefone:    lead.telefone,
              }}
            />

            {/* Tenant info */}
            {lead.tenant && (
              <SectionCard title="Tenant" icon={Layers}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: lead.tenant.primaryColor }}
                  >
                    {lead.tenant.nome.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{lead.tenant.nome}</p>
                    <p className="text-xs text-slate-400">{lead.tenant.slug}</p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Quick stats */}
            <SectionCard title="Resumo" icon={TrendingUp}>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Tarefas
                  </span>
                  <span className="font-semibold text-slate-800">{lead.tasks.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-yellow-500" /> Vendas
                  </span>
                  <span className="font-semibold text-slate-800">{lead.sales.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-500" /> Ligações IA
                  </span>
                  <span className="font-semibold text-slate-800">{lead.callLogs?.length ?? 0}</span>
                </div>
                {lead.sales.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Total vendido</span>
                    <span className="font-bold text-emerald-700">
                      {fmtCurrency(lead.sales.reduce((s, v) => s + v.totalAmount, 0))}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  )
}
