'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  model: string
  tone: string
  isActive: boolean
  tenant: { id: string; nome: string; slug: string }
  _count: { knowledgeBases: number; conversations: number }
  createdAt: string
}

interface Session {
  role: string
  tenantId: string | null
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4o': 'GPT-4o',
  'claude-3-haiku': 'Claude 3 Haiku',
  'claude-3-sonnet': 'Claude 3 Sonnet',
  'claude-3-opus': 'Claude 3 Opus',
}
const TONE_LABELS: Record<string, { label: string; color: string }> = {
  FORMAL: { label: 'Formal', color: 'bg-blue-100 text-blue-700' },
  NORMAL: { label: 'Normal', color: 'bg-slate-100 text-slate-600' },
  DESCONTRAIDA: { label: 'Descontraída', color: 'bg-amber-100 text-amber-700' },
}

export default function AgentesListClient({ session }: { session: Session }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', model: 'gpt-4o-mini', tone: 'NORMAL', systemPrompt: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/agents')
      const d = await r.json()
      if (d.success) setAgents(d.agents)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (d.success) {
        setShowModal(false)
        setForm({ name: '', model: 'gpt-4o-mini', tone: 'NORMAL', systemPrompt: '' })
        load()
      } else {
        setError(d.error?.message ?? 'Erro ao criar agente.')
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-3xl">🤖</span> Agentes de IA
          </h1>
          <p className="text-slate-500 text-sm mt-1">Configure assistentes inteligentes para atender seus leads automaticamente.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Novo Agente
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse h-48"/>)}
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="text-6xl mb-4">🤖</div>
          <h3 className="text-slate-700 font-semibold text-lg mb-2">Nenhum agente criado</h3>
          <p className="text-slate-400 text-sm mb-6">Crie seu primeiro agente de IA para automatizar o atendimento aos leads.</p>
          <button onClick={() => setShowModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all">
            Criar Primeiro Agente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => {
            const tone = TONE_LABELS[agent.tone] ?? { label: agent.tone, color: 'bg-slate-100 text-slate-600' }
            return (
              <Link key={agent.id} href={`/agentes/${agent.id}`}
                className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-sm text-white font-bold text-lg">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${agent.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {agent.isActive ? '● Ativo' : '○ Inativo'}
                  </span>
                </div>

                <h3 className="font-semibold text-slate-800 text-base group-hover:text-emerald-700 transition-colors">{agent.name}</h3>
                <p className="text-slate-400 text-xs mt-0.5">{agent.tenant?.nome}</p>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">
                    {MODEL_LABELS[agent.model] ?? agent.model}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tone.color}`}>
                    {tone.label}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                    {agent._count.knowledgeBases} treinamentos
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                    {agent._count.conversations} conversas
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Modal Criar Agente */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-lg">Novo Agente de IA</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Agente *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Assistente Rastremix"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Modelo LLM</label>
                <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="gpt-4o-mini">GPT-4o Mini (OpenAI) — Rápido e econômico</option>
                  <option value="gpt-4o">GPT-4o (OpenAI) — Máxima qualidade</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (Anthropic) — Rápido</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet (Anthropic) — Balanceado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tom de Voz</label>
                <div className="flex gap-2">
                  {(['FORMAL','NORMAL','DESCONTRAIDA'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, tone: t }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                        form.tone === t ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                      }`}>
                      {t === 'FORMAL' ? '🎩 Formal' : t === 'NORMAL' ? '🤝 Normal' : '😊 Descontraído'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Prompt de Sistema (opcional)</label>
                <textarea value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  rows={3} placeholder="Você é um assistente especializado em rastreamento veicular..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"/>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-all disabled:opacity-60">
                {saving ? 'Criando...' : 'Criar Agente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
