'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface Session { role: string; nome: string; tenantId: string | null }

interface Template {
  id: string
  name: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
  language: string
  preview: string
  variables: { key: string; label: string; example: string }[]
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO'
  headerContent?: string
  footer?: string
  buttons?: { type: string; text: string; url?: string }[]
}

interface AudienceFilters {
  funnelStage: string
  leadType: string
  daysSince: string
  tags: string
}

interface TemplateVarValues { [key: string]: string }

interface WizardForm {
  name: string
  templateId: string
  templateVars: TemplateVarValues
  audienceFilters: AudienceFilters
  scheduledAt: string
  sendNow: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock — Templates aprovados Meta
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_TEMPLATES: Template[] = [
  {
    id: 'tpl_1',
    name: 'rastreador_promo_anual',
    category: 'MARKETING',
    status: 'APPROVED',
    language: 'pt_BR',
    preview: 'Olá {{1}}! 🚗 Aproveite nossa promoção de rastreador veicular com instalação grátis e 12 meses por apenas R${{2}}/mês. Garantia total e suporte 24h.',
    variables: [
      { key: '1', label: 'Nome do cliente', example: 'Carlos' },
      { key: '2', label: 'Preço mensal', example: '49,90' },
    ],
    headerType: 'TEXT',
    headerContent: '🔒 Proteção Veicular ProspecLead',
    footer: 'Responda PARAR para cancelar.',
    buttons: [{ type: 'URL', text: 'Ver Oferta', url: 'https://prospeclead.com/oferta' }],
  },
  {
    id: 'tpl_2',
    name: 'bloqueio_partida_frota',
    category: 'MARKETING',
    status: 'APPROVED',
    language: 'pt_BR',
    preview: 'Oi {{1}}, tudo bem? 👋 Sua frota merece proteção total. Nosso sistema de bloqueio de partida com telemetria avançada está com condições especiais para frotas acima de {{2}} veículos.',
    variables: [
      { key: '1', label: 'Nome do gestor', example: 'João' },
      { key: '2', label: 'Tamanho mínimo da frota', example: '5' },
    ],
    headerType: 'IMAGE',
    headerContent: 'https://via.placeholder.com/400x200/1e40af/white?text=Bloqueio+de+Partida',
    footer: 'ProspecLead Telemetria — www.prospeclead.com',
    buttons: [
      { type: 'URL', text: 'Solicitar Demonstração', url: 'https://prospeclead.com/demo' },
      { type: 'QUICK_REPLY', text: 'Falar com Consultor' },
    ],
  },
  {
    id: 'tpl_3',
    name: 'sensor_fadiga_mineracao',
    category: 'UTILITY',
    status: 'APPROVED',
    language: 'pt_BR',
    preview: 'Prezado {{1}}, identificamos que a {{2}} pode se beneficiar do nosso sensor de fadiga com IA para operações em mineração. Compatível com todos os equipamentos Vale e CAT.',
    variables: [
      { key: '1', label: 'Nome do responsável', example: 'Ana' },
      { key: '2', label: 'Nome da empresa', example: 'Mineradora ABC' },
    ],
    headerType: 'TEXT',
    headerContent: '⛏️ Segurança na Mineração',
    footer: 'Homologado pela Vale e certificado ANTT.',
  },
  {
    id: 'tpl_4',
    name: 'reativacao_lead_frio',
    category: 'MARKETING',
    status: 'APPROVED',
    language: 'pt_BR',
    preview: 'Olá {{1}}! 👋 Há algum tempo não nos falamos. Preparamos uma proposta especial de rastreamento veicular só para você. Válida por 48h.',
    variables: [
      { key: '1', label: 'Primeiro nome', example: 'Maria' },
    ],
    headerType: 'TEXT',
    headerContent: '🔥 Oferta Exclusiva — Expira em 48h',
    footer: 'Para não receber mais mensagens, responda PARAR.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Quero saber mais!' }],
  },
]

const FUNNEL_STAGES = [
  { value: '', label: 'Todos os estágios' },
  { value: 'LEAD_COLETADO', label: 'Lead Coletado' },
  { value: 'QUALIFICADO', label: 'Qualificado' },
  { value: 'PROPOSTA_ENVIADA', label: 'Proposta Enviada' },
  { value: 'NEGOCIANDO', label: 'Negociando' },
  { value: 'LOST', label: 'Perdido' },
]

const LEAD_TYPES = [
  { value: '', label: 'Todos os tipos' },
  { value: 'B2C', label: 'B2C — Pessoa Física' },
  { value: 'B2B', label: 'B2B — Empresa' },
]

const DAYS_SINCE_OPTIONS = [
  { value: '', label: 'Qualquer período' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' },
]

// Mapa de estágio → leads mock
const MOCK_LEAD_COUNTS: Record<string, number> = {
  '':                 1247,
  'LEAD_COLETADO':     512,
  'QUALIFICADO':       298,
  'PROPOSTA_ENVIADA':  187,
  'NEGOCIANDO':         93,
  'LOST':              157,
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function NovaCampanhaWizard({ session }: { session: Session }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<WizardForm>({
    name: '',
    templateId: '',
    templateVars: {},
    audienceFilters: { funnelStage: '', leadType: '', daysSince: '', tags: '' },
    scheduledAt: '',
    sendNow: true,
  })

  // Template selecionado
  const selectedTemplate = useMemo(
    () => MOCK_TEMPLATES.find(t => t.id === form.templateId) ?? null,
    [form.templateId]
  )

  // Contagem de leads estimada (mock)
  const estimatedLeads = useMemo(() => {
    const base = MOCK_LEAD_COUNTS[form.audienceFilters.funnelStage] ?? 1247
    const typeMultiplier = form.audienceFilters.leadType === 'B2B' ? 0.35
      : form.audienceFilters.leadType === 'B2C' ? 0.65 : 1
    const daysFactor = form.audienceFilters.daysSince
      ? Math.max(0.1, Number(form.audienceFilters.daysSince) / 365)
      : 1
    return Math.max(1, Math.round(base * typeMultiplier * daysFactor))
  }, [form.audienceFilters])

  // Preview do template com variáveis substituídas
  const previewText = useMemo(() => {
    if (!selectedTemplate) return ''
    return selectedTemplate.preview.replace(/\{\{(\d+)\}\}/g, (_, key) =>
      form.templateVars[key] || selectedTemplate.variables.find(v => v.key === key)?.example || `{{${key}}}`
    )
  }, [selectedTemplate, form.templateVars])

  const updateFilters = useCallback((k: keyof AudienceFilters, v: string) => {
    setForm(f => ({ ...f, audienceFilters: { ...f.audienceFilters, [k]: v } }))
  }, [])

  const updateVar = useCallback((key: string, val: string) => {
    setForm(f => ({ ...f, templateVars: { ...f.templateVars, [key]: val } }))
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!form.name.trim()) { setError('Dê um nome para a campanha.'); return }
    if (!form.templateId) { setError('Selecione um template.'); return }

    setLoading(true)
    setError(null)

    try {
      const templateObj = MOCK_TEMPLATES.find(t => t.id === form.templateId)

      // 1 — Cria campanha
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          templateName: templateObj?.name ?? form.templateId,
          templateVars: form.templateVars,
          templateLanguage: templateObj?.language ?? 'pt_BR',
          audienceFilters: form.audienceFilters,
          scheduledAt: form.sendNow ? null : form.scheduledAt || null,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error?.message ?? 'Erro ao criar campanha')

      const campaignId: string = data.campaign.id

      // 2 — Lança se "Enviar Agora"
      if (form.sendNow) {
        await fetch(`/api/campaigns/${campaignId}/launch`, { method: 'POST' })
      }

      router.push('/campanhas')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── Passos ──────────────────────────────────────────────────────────────────
  const steps = [
    { n: 1, label: 'Segmentação' },
    { n: 2, label: 'Mensagem' },
    { n: 3, label: 'Agendamento' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/campanhas" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Nova Campanha WhatsApp</h1>
            <p className="text-sm text-gray-500">Wizard de criação em {steps.length} passos</p>
          </div>
        </div>
        <div className="text-sm text-gray-500">Olá, {session.nome}</div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex items-center gap-0 max-w-2xl">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <button
                onClick={() => step > s.n && setStep(s.n)}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  step === s.n ? 'text-green-600' : step > s.n ? 'text-gray-700 hover:text-green-600' : 'text-gray-400'
                }`}
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  step === s.n ? 'border-green-500 bg-green-500 text-white'
                  : step > s.n ? 'border-green-500 bg-white text-green-600'
                  : 'border-gray-300 bg-white text-gray-400'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 transition-colors ${step > s.n ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── STEP 1: Segmentação de Audiência ─────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Nome da campanha */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Identifique a Campanha
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome interno da campanha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder='ex: "Reativação Leads Frios — Junho 2025"'
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Nome visível apenas internamente, não aparece para o cliente.</p>
                </div>
              </div>

              {/* Filtros de segmentação */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Segmentação de Audiência
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estágio no Funil</label>
                    <select
                      value={form.audienceFilters.funnelStage}
                      onChange={e => updateFilters('funnelStage', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      {FUNNEL_STAGES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Lead</label>
                    <select
                      value={form.audienceFilters.leadType}
                      onChange={e => updateFilters('leadType', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      {LEAD_TYPES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de Captura</label>
                    <select
                      value={form.audienceFilters.daysSince}
                      onChange={e => updateFilters('daysSince', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      {DAYS_SINCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                    <input
                      type="text"
                      value={form.audienceFilters.tags}
                      onChange={e => updateFilters('tags', e.target.value)}
                      placeholder='ex: "mineração, vale, frota"'
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Separe por vírgula</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card de audiência estimada */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                  </svg>
                  <span className="text-sm font-medium opacity-90">Audiência Estimada</span>
                </div>
                <div className="text-5xl font-bold mb-1">
                  {estimatedLeads.toLocaleString('pt-BR')}
                </div>
                <div className="text-sm opacity-80">leads com telefone ativo</div>
                <div className="mt-4 pt-4 border-t border-white/20 text-xs opacity-70 space-y-1">
                  <div>Funil: {FUNNEL_STAGES.find(s => s.value === form.audienceFilters.funnelStage)?.label ?? '—'}</div>
                  <div>Tipo: {LEAD_TYPES.find(t => t.value === form.audienceFilters.leadType)?.label ?? '—'}</div>
                  <div>Período: {DAYS_SINCE_OPTIONS.find(d => d.value === form.audienceFilters.daysSince)?.label ?? '—'}</div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-xs text-amber-700">
                    <p className="font-semibold mb-1">Rate Limits Meta</p>
                    <p>Tier 1: até 1.000 msg/24h</p>
                    <p>Tier 2: até 10.000 msg/24h</p>
                    <p className="mt-1 opacity-80">Disparamos em lotes de 50 msg/s com controle automático de limite.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Configuração da Mensagem ─────────────────────────────── */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Configuração */}
            <div className="lg:col-span-3 space-y-5">
              {/* Seleção de template */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Template Aprovado Meta
                </h2>
                <div className="space-y-3">
                  {MOCK_TEMPLATES.map(t => (
                    <label key={t.id} className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${
                      form.templateId === t.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="template"
                          value={t.id}
                          checked={form.templateId === t.id}
                          onChange={() => setForm(f => ({ ...f, templateId: t.id, templateVars: {} }))}
                          className="mt-1 accent-green-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">{t.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              t.category === 'MARKETING' ? 'bg-purple-100 text-purple-700'
                              : t.category === 'UTILITY' ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                            }`}>{t.category}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ {t.status}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.preview.replace(/\{\{(\d+)\}\}/g, (_, k) => `[${t.variables.find(v => v.key === k)?.example ?? k}]`)}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Variáveis do template */}
              {selectedTemplate && selectedTemplate.variables.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    Variáveis do Template
                  </h2>
                  <p className="text-xs text-gray-500 mb-4">Configure como cada variável será preenchida. Deixe em branco para usar o valor de exemplo.</p>
                  <div className="space-y-4">
                    {selectedTemplate.variables.map(v => (
                      <div key={v.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-green-700 text-xs">{`{{${v.key}}}`}</code>
                          <span className="ml-2">{v.label}</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={form.templateVars[v.key] ?? ''}
                            onChange={e => updateVar(v.key, e.target.value)}
                            placeholder={`ex: "${v.example}" (padrão: campo automático)`}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <button
                            onClick={() => updateVar(v.key, v.example)}
                            className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                          >
                            Usar exemplo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview — celular */}
            <div className="lg:col-span-2">
              <div className="sticky top-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Preview no celular
                </h3>
                {/* Moldura do celular */}
                <div className="relative mx-auto" style={{ width: 280 }}>
                  <div className="bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
                    <div className="bg-[#0f1923] rounded-[2rem] overflow-hidden">
                      {/* Status bar */}
                      <div className="bg-[#0f1923] flex items-center justify-between px-5 pt-3 pb-2">
                        <span className="text-white text-xs">9:41</span>
                        <div className="w-16 h-4 bg-gray-800 rounded-full" />
                        <div className="flex gap-1">
                          <div className="w-3 h-3 bg-white/60 rounded-sm" />
                          <div className="w-3 h-3 bg-white/60 rounded-sm" />
                        </div>
                      </div>
                      {/* WhatsApp header */}
                      <div className="bg-[#1f2c34] flex items-center gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">P</span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium leading-none">ProspecLead</p>
                          <p className="text-gray-400 text-xs mt-0.5">conta empresarial verificada</p>
                        </div>
                      </div>

                      {/* Mensagens */}
                      <div className="bg-[#0b141a] min-h-[360px] px-3 py-4 space-y-2">
                        {selectedTemplate ? (
                          <div className="flex justify-start">
                            <div className="bg-[#1f2c34] rounded-lg rounded-tl-sm max-w-[220px] px-3 py-2 shadow-sm">
                              {/* Header */}
                              {selectedTemplate.headerType === 'IMAGE' && selectedTemplate.headerContent && (
                                <div className="rounded-md overflow-hidden mb-2 bg-gray-700 flex items-center justify-center h-24">
                                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              {selectedTemplate.headerType === 'TEXT' && selectedTemplate.headerContent && (
                                <p className="text-green-400 text-xs font-bold mb-2">{selectedTemplate.headerContent}</p>
                              )}
                              {/* Body */}
                              <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">{previewText}</p>
                              {/* Footer */}
                              {selectedTemplate.footer && (
                                <p className="text-gray-400 text-[10px] mt-2 leading-tight">{selectedTemplate.footer}</p>
                              )}
                              {/* Timestamp */}
                              <div className="flex justify-end mt-1">
                                <span className="text-gray-500 text-[10px]">09:41 ✓✓</span>
                              </div>
                              {/* Buttons */}
                              {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                                <div className="border-t border-gray-600/50 mt-2 pt-2 space-y-1.5">
                                  {selectedTemplate.buttons.map((btn, i) => (
                                    <div key={i} className="flex items-center justify-center gap-1 text-[#53bdeb] text-xs font-medium">
                                      {btn.type === 'URL' ? (
                                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>{btn.text}</>
                                      ) : (
                                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>{btn.text}</>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-48 text-gray-600 text-xs text-center">
                            <div>
                              <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              Selecione um template<br/>para ver o preview
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input bar */}
                      <div className="bg-[#1f2c34] flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 bg-[#2a3942] rounded-full px-4 py-1.5 text-xs text-gray-500">Mensagem</div>
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Agendamento & Lançamento ──────────────────────────────── */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-5 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                Quando disparar?
              </h2>
              <div className="space-y-3">
                <label className={`flex items-start gap-4 border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  form.sendNow ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="schedule"
                    checked={form.sendNow}
                    onChange={() => setForm(f => ({ ...f, sendNow: true }))}
                    className="mt-1 accent-green-500"
                  />
                  <div>
                    <p className="font-semibold text-gray-800">🚀 Enviar Agora</p>
                    <p className="text-sm text-gray-500 mt-0.5">Inicia o disparo imediatamente após confirmar.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-4 border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  !form.sendNow ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="schedule"
                    checked={!form.sendNow}
                    onChange={() => setForm(f => ({ ...f, sendNow: false }))}
                    className="mt-1 accent-green-500"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">📅 Agendar para mais tarde</p>
                    <p className="text-sm text-gray-500 mt-0.5">Escolha data e hora para o disparo automático.</p>
                    {!form.sendNow && (
                      <input
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                        min={new Date().toISOString().slice(0, 16)}
                        className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Resumo */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                Resumo da Campanha
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Nome</dt>
                  <dd className="font-medium text-gray-900">{form.name || '—'}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Template</dt>
                  <dd className="font-medium text-gray-900">{selectedTemplate?.name ?? '—'}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Audiência estimada</dt>
                  <dd className="font-bold text-green-600">{estimatedLeads.toLocaleString('pt-BR')} leads</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Funil</dt>
                  <dd className="font-medium text-gray-900">{FUNNEL_STAGES.find(s => s.value === form.audienceFilters.funnelStage)?.label ?? 'Todos'}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-gray-500">Envio</dt>
                  <dd className="font-medium text-gray-900">
                    {form.sendNow ? '🚀 Imediato' : form.scheduledAt ? `📅 ${new Date(form.scheduledAt).toLocaleString('pt-BR')}` : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Navegação entre passos */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : router.push('/campanhas')}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>

          <div className="flex items-center gap-2">
            {steps.map(s => (
              <div key={s.n} className={`w-2 h-2 rounded-full transition-colors ${step === s.n ? 'bg-green-500' : step > s.n ? 'bg-green-300' : 'bg-gray-300'}`} />
            ))}
          </div>

          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && !form.name.trim()) { setError('Informe o nome da campanha.'); return }
                if (step === 2 && !form.templateId) { setError('Selecione um template.'); return }
                setError(null)
                setStep(s => s + 1)
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Próximo
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-bold transition-colors shadow-sm disabled:cursor-not-allowed"
            >
              {loading ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Criando...</>
              ) : (
                <>🚀 {form.sendNow ? 'Iniciar Campanha' : 'Agendar Campanha'}</>
              )}
            </button>
          )}
        </div>

        {error && step !== 3 && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
