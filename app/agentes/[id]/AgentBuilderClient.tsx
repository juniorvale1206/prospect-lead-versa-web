'use client'

import { useEffect, useState, useRef, useCallback, Dispatch, SetStateAction } from 'react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface KnowledgeItem {
  id: string
  type: 'TEXT' | 'WEBSITE' | 'DOCUMENT'
  title: string
  content: string
  status: 'TRAINED' | 'PENDING' | 'FAILED'
  createdAt: string
}
interface Agent {
  id: string
  name: string
  model: string
  tone: string
  systemPrompt: string
  isActive: boolean
  tenant: { id: string; nome: string }
  _count: { conversations: number }
  knowledgeBases: KnowledgeItem[]
}
interface Session { role: string; nome: string; tenantId: string | null }

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
const MODELS = [
  { value: 'gpt-4o-mini',    label: 'GPT-4o Mini',     provider: 'OpenAI',    badge: 'Rápido · Econômico',   icon: '⚡' },
  { value: 'gpt-4o',         label: 'GPT-4o',           provider: 'OpenAI',    badge: 'Máxima Qualidade',     icon: '🧠' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku',   provider: 'Anthropic', badge: 'Ultra Rápido',        icon: '🌿' },
  { value: 'claude-3-sonnet',label: 'Claude 3 Sonnet',  provider: 'Anthropic', badge: 'Balanceado',           icon: '🎯' },
  { value: 'claude-3-opus',  label: 'Claude 3 Opus',    provider: 'Anthropic', badge: 'Máxima Qualidade',     icon: '👑' },
]
const TONES = [
  { value: 'FORMAL',        emoji: '🎩', label: 'Formal',        desc: 'Profissional e respeitoso' },
  { value: 'NORMAL',        emoji: '🤝', label: 'Normal',        desc: 'Natural e prestativo' },
  { value: 'DESCONTRAIDA',  emoji: '😊', label: 'Descontraído',  desc: 'Amigável e casual' },
]
const TABS = [
  { id: 'perfil',       label: 'Perfil',        icon: '👤' },
  { id: 'modelo',       label: 'Modelos',       icon: '🧠' },
  { id: 'treinamentos', label: 'Treinamentos',  icon: '📚' },
  { id: 'intencoes',    label: 'Intenções',     icon: '🎯' },
  { id: 'integracoes',  label: 'Integrações',   icon: '🔗' },
  { id: 'canais',       label: 'Canais',        icon: '📡' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────
export default function AgentBuilderClient({ agentId, session }: { agentId: string; session: Session }) {
  const [agent, setAgent]       = useState<Agent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('perfil')
  const [saving, setSaving]     = useState(false)
  const [saveOk, setSaveOk]     = useState(false)
  const [form, setForm]         = useState({ name: '', tone: 'NORMAL', systemPrompt: '', model: 'gpt-4o-mini', isActive: true })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/agents/${agentId}`)
      const d = await r.json()
      if (d.success) {
        setAgent(d.agent)
        setForm({ name: d.agent.name, tone: d.agent.tone, systemPrompt: d.agent.systemPrompt, model: d.agent.model, isActive: d.agent.isActive })
      }
    } finally { setLoading(false) }
  }, [agentId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true); setSaveOk(false)
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false); setSaveOk(true)
    setTimeout(() => setSaveOk(false), 3000)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-slate-500 text-sm">Carregando agente...</p>
      </div>
    </div>
  )

  if (!agent) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <p className="text-slate-500">Agente não encontrado.</p>
      <Link href="/agentes" className="text-emerald-600 hover:underline text-sm">← Voltar para lista</Link>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ── Sidebar de abas ─────────────────────────────────────────────── */}
      <div className="w-52 border-r border-slate-200 bg-white flex flex-col">
        {/* Header do agente */}
        <div className="p-4 border-b border-slate-100">
          <Link href="/agentes" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-xs mb-3 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            Todos os agentes
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-slate-800 font-semibold text-sm truncate">{agent.name}</p>
              <p className="text-slate-400 text-[11px]">{agent.tenant?.nome}</p>
            </div>
          </div>
          <div className="mt-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${form.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${form.isActive ? 'bg-emerald-500' : 'bg-red-400'}`}/>
              {form.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>

        {/* Abas */}
        <nav className="flex-1 py-2">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-50 text-emerald-700 border-r-2 border-emerald-500'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}>
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="p-4 border-t border-slate-100 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Conversas</span>
            <span className="font-semibold text-slate-700">{agent._count.conversations}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Treinamentos</span>
            <span className="font-semibold text-slate-700">{agent.knowledgeBases.length}</span>
          </div>
        </div>
      </div>

      {/* ── Conteúdo das abas ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {/* Barra de ação */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-700">
            {TABS.find(t => t.id === activeTab)?.icon} {TABS.find(t => t.id === activeTab)?.label}
          </h2>
          {['perfil', 'modelo'].includes(activeTab) && (
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                saveOk
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              } disabled:opacity-60`}>
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Salvando...</>
              ) : saveOk ? (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> Salvo!</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Salvar</>
              )}
            </button>
          )}
        </div>

        <div className="p-6 max-w-3xl mx-auto">
          {activeTab === 'perfil'       && <TabPerfil form={form} setForm={setForm} />}
          {activeTab === 'modelo'       && <TabModelo form={form} setForm={setForm} />}
          {activeTab === 'treinamentos' && <TabTreinamentos agentId={agentId} items={agent.knowledgeBases} onRefresh={load} />}
          {activeTab === 'intencoes'    && <TabIntencoes />}
          {activeTab === 'integracoes'  && <TabIntegracoes />}
          {activeTab === 'canais'       && <TabCanais />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de form compartilhado
// ─────────────────────────────────────────────────────────────────────────────
type AgentForm = { name: string; tone: string; systemPrompt: string; model: string; isActive: boolean }
type SetAgentForm = Dispatch<SetStateAction<AgentForm>>

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Perfil
// ─────────────────────────────────────────────────────────────────────────────
function TabPerfil({ form, setForm }: { form: AgentForm; setForm: SetAgentForm }) {
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-700 mb-5">Identidade do Agente</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Agente *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Tom de Voz</label>
            <div className="grid grid-cols-3 gap-3">
              {TONES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, tone: t.value }))}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    form.tone === t.value
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-slate-200 hover:border-emerald-300'
                  }`}>
                  <div className="text-2xl mb-1">{t.emoji}</div>
                  <div className="text-sm font-semibold text-slate-700">{t.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : ''}`}/>
              </div>
              <span className="text-sm text-slate-600">{form.isActive ? 'Agente Ativo' : 'Agente Inativo'}</span>
            </label>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-700">Prompt de Sistema</h3>
            <p className="text-slate-400 text-xs mt-0.5">Instruções de comportamento que o agente seguirá em todas as conversas.</p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{form.systemPrompt.length} chars</span>
        </div>
        <textarea value={form.systemPrompt}
          onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
          rows={10}
          placeholder={`Você é um assistente especializado em rastreamento veicular da Rastremix.\n\nSeu objetivo é:\n1. Qualificar leads que entram pelo WhatsApp\n2. Identificar o tipo de veículo e necessidade\n3. Apresentar os planos disponíveis\n4. Agendar demonstração com um consultor\n\nSempre seja cordial e responda em português do Brasil.\nNunca prometa preços sem verificar com o consultor.\nSe o cliente pedir para falar com humano, acione a transferência.`}
          className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
        <p className="text-xs text-slate-400 mt-2">💡 Dica: seja específico sobre o produto, tom e quando transferir para humano.</p>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Modelos
// ─────────────────────────────────────────────────────────────────────────────
function TabModelo({ form, setForm }: { form: AgentForm; setForm: SetAgentForm }) {
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-700 mb-1">Selecionar Modelo LLM</h3>
        <p className="text-slate-400 text-sm mb-5">Escolha o modelo de linguagem que irá alimentar este agente.</p>

        <div className="space-y-3">
          {MODELS.map(m => (
            <button key={m.value} onClick={() => setForm(f => ({ ...f, model: m.value }))}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                form.model === m.value
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
              }`}>
              <span className="text-2xl w-8 text-center">{m.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 text-sm">{m.label}</span>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{m.provider}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{m.badge}</p>
              </div>
              {form.model === m.value && (
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <div className="flex gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-amber-800 font-medium text-sm">Configuração de API Key</p>
            <p className="text-amber-700 text-xs mt-1">Para usar modelos OpenAI ou Anthropic em produção, configure as chaves nas <strong>Configurações &gt; Integrações IA</strong>.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Treinamentos (RAG / Knowledge Base)
// ─────────────────────────────────────────────────────────────────────────────
function TabTreinamentos({ agentId, items, onRefresh }: { agentId: string; items: KnowledgeItem[]; onRefresh: () => void }) {
  const [subTab, setSubTab]     = useState<'TEXT' | 'WEBSITE' | 'DOCUMENT'>('TEXT')
  const [content, setContent]   = useState('')
  const [title, setTitle]       = useState('')
  const [url, setUrl]           = useState('')
  const [adding, setAdding]     = useState(false)
  const [error, setError]       = useState('')

  async function handleAdd() {
    const payload = subTab === 'WEBSITE'
      ? { type: subTab, content: url, title: title || url }
      : { type: subTab, content, title: title || content.slice(0, 60) }

    if (!payload.content.trim()) { setError('Conteúdo é obrigatório.'); return }
    setAdding(true); setError('')
    try {
      const r = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.success) {
        setContent(''); setTitle(''); setUrl(''); onRefresh()
      } else {
        setError(d.error?.message ?? 'Erro ao adicionar.')
      }
    } finally { setAdding(false) }
  }

  async function handleDelete(itemId: string) {
    if (!confirm('Remover este treinamento?')) return
    await fetch(`/api/agents/${agentId}/knowledge?itemId=${itemId}`, { method: 'DELETE' })
    onRefresh()
  }

  const filtered = items.filter(i => i.type === subTab)

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {(['TEXT', 'WEBSITE', 'DOCUMENT'] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-all ${
                subTab === t ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500' : 'text-slate-500 hover:bg-slate-50'
              }`}>
              {t === 'TEXT' ? '📝 Texto' : t === 'WEBSITE' ? '🌐 Website' : '📄 Arquivo'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

          {subTab === 'TEXT' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Título (opcional)</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: FAQ sobre rastreamento"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Conteúdo *</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                  placeholder="Cole aqui as informações que o agente deve conhecer: FAQs, características do produto, scripts de atendimento..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"/>
                <p className="text-xs text-slate-400 mt-1">{content.length} caracteres</p>
              </div>
            </div>
          )}

          {subTab === 'WEBSITE' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                🕷️ O sistema irá rastrear a URL e extrair o conteúdo automaticamente para treinar o agente.
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">URL do Site *</label>
                <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://rastremix.com.br/faq"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Título (opcional)</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Página de preços Rastremix"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
              </div>
            </div>
          )}

          {subTab === 'DOCUMENT' && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-slate-600 font-medium text-sm">Arraste seu arquivo aqui</p>
                <p className="text-slate-400 text-xs mt-1">PDF, DOCX, TXT — até 10MB</p>
                <button className="mt-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all">
                  Selecionar Arquivo
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                ⚠️ Upload de documentos requer integração com storage (R2/S3). Configure em <strong>Integrações</strong>.
              </div>
            </div>
          )}

          <button onClick={handleAdd} disabled={adding}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {adding ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Treinando...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> Adicionar Treinamento</>
            )}
          </button>
        </div>
      </div>

      {/* Lista de treinamentos */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">
          {filtered.length} treinamento{filtered.length !== 1 ? 's' : ''} ({subTab === 'TEXT' ? 'texto' : subTab === 'WEBSITE' ? 'website' : 'arquivo'})
        </h3>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
            Nenhum treinamento do tipo {subTab} ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                <div className="text-lg mt-0.5">
                  {item.type === 'TEXT' ? '📝' : item.type === 'WEBSITE' ? '🌐' : '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-700 truncate">{item.title || item.content.slice(0, 60)}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                      item.status === 'TRAINED' ? 'bg-emerald-50 text-emerald-600' :
                      item.status === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {item.status === 'TRAINED' ? '● Treinado' : item.status === 'FAILED' ? '✗ Falhou' : '⟳ Pendente'}
                    </span>
                  </div>
                  {item.type === 'TEXT' && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{item.content.slice(0, 100)}...</p>
                  )}
                  {item.type === 'WEBSITE' && (
                    <a href={item.content} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline mt-0.5 block truncate">{item.content}</a>
                  )}
                  <p className="text-xs text-slate-300 mt-1">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <button onClick={() => handleDelete(item.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Intenções (placeholder)
// ─────────────────────────────────────────────────────────────────────────────
function TabIntencoes() {
  const intents = [
    { icon: '💰', name: 'Consultar Preço', triggers: ['quanto custa', 'preço', 'valor', 'plano'], action: 'Apresentar tabela de preços' },
    { icon: '📅', name: 'Agendar Visita', triggers: ['quero ver', 'demonstração', 'agendar', 'reunião'], action: 'Abrir fluxo de agendamento' },
    { icon: '🙋', name: 'Falar com Humano', triggers: ['falar com pessoa', 'atendente', 'humano'], action: 'Transferir para operador' },
    { icon: '❓', name: 'Tirar Dúvida', triggers: ['como funciona', 'o que é', 'dúvida'], action: 'Consultar base de conhecimento' },
  ]
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        🎯 Intenções são padrões de mensagem que disparam ações específicas do agente, com prioridade sobre o prompt geral.
      </div>
      <div className="space-y-3">
        {intents.map((intent, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{intent.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-700 text-sm">{intent.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {intent.triggers.map(t => (
                    <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">"{t}"</span>
                  ))}
                </div>
                <p className="text-xs text-emerald-600 mt-2 font-medium">→ {intent.action}</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-semibold">Ativo</span>
            </div>
          </div>
        ))}
      </div>
      <button className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-400 rounded-xl text-sm hover:border-emerald-400 hover:text-emerald-500 transition-all">
        + Adicionar nova intenção
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Integrações (placeholder)
// ─────────────────────────────────────────────────────────────────────────────
function TabIntegracoes() {
  const integracoes = [
    { name: 'OpenAI API', icon: '🤖', desc: 'Modelos GPT-4o para geração de texto', status: 'config', color: 'bg-violet-50 border-violet-200' },
    { name: 'Anthropic API', icon: '🌿', desc: 'Modelos Claude para geração de texto', status: 'pending', color: 'bg-slate-50 border-slate-200' },
    { name: 'Pinecone', icon: '🌲', desc: 'Vector database para RAG/embeddings', status: 'pending', color: 'bg-slate-50 border-slate-200' },
    { name: 'Cloudflare R2', icon: '☁️', desc: 'Storage de documentos para treinamento', status: 'pending', color: 'bg-slate-50 border-slate-200' },
    { name: 'WhatsApp Business', icon: '💬', desc: 'Meta Cloud API (webhook configurado)', status: 'active', color: 'bg-emerald-50 border-emerald-200' },
    { name: 'Instagram API', icon: '📷', desc: 'Mensagens diretas via Graph API', status: 'pending', color: 'bg-slate-50 border-slate-200' },
  ]
  return (
    <div className="grid grid-cols-1 gap-3">
      {integracoes.map((int, i) => (
        <div key={i} className={`rounded-xl border p-4 flex items-center gap-4 ${int.color}`}>
          <span className="text-2xl">{int.icon}</span>
          <div className="flex-1">
            <p className="font-semibold text-slate-700 text-sm">{int.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{int.desc}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            int.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
            int.status === 'config' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'
          }`}>
            {int.status === 'active' ? 'Conectado' : int.status === 'config' ? 'Configurar' : 'Pendente'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba: Canais (placeholder)
// ─────────────────────────────────────────────────────────────────────────────
function TabCanais() {
  const canais = [
    { type: 'WHATSAPP_META', icon: '💬', label: 'WhatsApp Business', number: '+55 11 9 9999-0001', status: 'Conectado', active: true },
    { type: 'INSTAGRAM', icon: '📷', label: 'Instagram DM', number: '@rastremix_oficial', status: 'Pendente', active: false },
    { type: 'WEBCHAT', icon: '🌐', label: 'Webchat (Widget)', number: 'rastremix.com.br', status: 'Inativo', active: false },
  ]
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {canais.map((c, i) => (
          <div key={i} className={`flex items-center gap-4 p-4 ${i !== canais.length - 1 ? 'border-b border-slate-100' : ''}`}>
            <span className="text-2xl">{c.icon}</span>
            <div className="flex-1">
              <p className="font-medium text-slate-700 text-sm">{c.label}</p>
              <p className="text-xs text-slate-400">{c.number}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              c.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}>{c.status}</span>
            <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-all">
              Configurar
            </button>
          </div>
        ))}
      </div>
      <button className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-400 rounded-xl text-sm hover:border-emerald-400 hover:text-emerald-500 transition-all">
        + Conectar novo canal
      </button>
    </div>
  )
}
