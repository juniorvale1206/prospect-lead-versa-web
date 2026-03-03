'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface ConvMessage {
  id: string
  senderType: 'USER' | 'BOT' | 'HUMAN'
  senderName: string
  content: string
  messageType: string
  mediaUrl?: string
  read: boolean
  timestamp: string
}

interface Conversation {
  id: string
  contactId: string
  contactName: string
  contactAvatar?: string
  status: 'WAITING' | 'BOT_HANDLING' | 'HUMAN_HANDLING' | 'RESOLVED'
  assignedToId?: string
  agent: { id: string; name: string }
  channel: { id: string; type: string; name: string }
  messages: ConvMessage[]
  _count: { messages: number }
  updatedAt: string
  tenantId?: string
}

interface Session {
  role: string
  nome: string
  userId: string
  tenantId: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data — conversas realistas para demo
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    contactId: '5511999990001',
    contactName: 'Ricardo Mendonça',
    status: 'WAITING',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm1', senderType: 'USER', senderName: 'Ricardo', content: 'Olá, tenho uma frota de 12 caminhões e quero rastreamento. Qual o melhor plano?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 8 * 60000).toISOString() },
      { id: 'm2', senderType: 'BOT', senderName: 'Bot IA', content: 'Olá Ricardo! Que ótimo que você está pensando em rastrear sua frota. Para 12 caminhões, temos o Plano Frota Pro que oferece rastreamento em tempo real, cercas eletrônicas e relatórios de desempenho. O valor é R$ 89/mês por veículo. Posso enviar uma proposta detalhada?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 7 * 60000).toISOString() },
      { id: 'm3', senderType: 'USER', senderName: 'Ricardo', content: 'Sim! Mas preciso saber se tem sensor de fadiga também para os motoristas.', messageType: 'text', read: false, timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
    ],
    _count: { messages: 3 },
    updatedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 'conv-2',
    contactId: '5511988880002',
    contactName: 'Mariana Costa',
    status: 'BOT_HANDLING',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm4', senderType: 'USER', senderName: 'Mariana', content: 'Boa tarde! Vi no Instagram sobre o sensor de fadiga. Vocês atendem SP capital?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 35 * 60000).toISOString() },
      { id: 'm5', senderType: 'BOT', senderName: 'Bot IA', content: 'Boa tarde, Mariana! Sim, atendemos São Paulo capital e Grande SP. Nosso sensor DMS detecta fadiga, distração e uso de celular em tempo real. Sua empresa tem quantos veículos?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 34 * 60000).toISOString() },
      { id: 'm6', senderType: 'USER', senderName: 'Mariana', content: 'Temos 3 vans e 2 caminhões. Fazemos entrega para a Vale aqui em SP.', messageType: 'text', read: true, timestamp: new Date(Date.now() - 30 * 60000).toISOString() },
      { id: 'm7', senderType: 'BOT', senderName: 'Bot IA', content: 'Perfeito! Para 5 veículos com sensores DMS temos um pacote especial. Qual o melhor horário para nosso consultor entrar em contato com uma proposta personalizada?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 28 * 60000).toISOString() },
    ],
    _count: { messages: 4 },
    updatedAt: new Date(Date.now() - 28 * 60000).toISOString(),
  },
  {
    id: 'conv-3',
    contactId: 'ig.user.34512',
    contactName: 'Fernando Alves',
    status: 'HUMAN_HANDLING',
    assignedToId: 'user-operator-1',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-2', type: 'INSTAGRAM', name: 'Instagram @rastremix' },
    messages: [
      { id: 'm8', senderType: 'USER', senderName: 'Fernando', content: 'Oi! Quero saber sobre bloqueio de partida para minha frota de motos.', messageType: 'text', read: true, timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
      { id: 'm9', senderType: 'BOT', senderName: 'Bot IA', content: 'Olá Fernando! Temos solução de bloqueio remoto por aplicativo para motos e veículos leves. Como posso ajudar?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 2 * 3600000 + 60000).toISOString() },
      { id: 'm10', senderType: 'USER', senderName: 'Fernando', content: 'Preciso falar com um atendente humano por favor.', messageType: 'text', read: true, timestamp: new Date(Date.now() - 90 * 60000).toISOString() },
      { id: 'm11', senderType: 'HUMAN', senderName: 'Lucas (Operador)', content: 'Olá Fernando! Aqui é o Lucas, consultor da Rastremix. Pode me contar mais sobre sua frota de motos?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 85 * 60000).toISOString() },
      { id: 'm12', senderType: 'USER', senderName: 'Fernando', content: 'Tenho 8 motos de delivery. Preciso bloquear remotamente em caso de roubo.', messageType: 'text', read: true, timestamp: new Date(Date.now() - 80 * 60000).toISOString() },
    ],
    _count: { messages: 5 },
    updatedAt: new Date(Date.now() - 80 * 60000).toISOString(),
  },
  {
    id: 'conv-4',
    contactId: '5521977770003',
    contactName: 'Juliana Rodrigues',
    status: 'RESOLVED',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm13', senderType: 'USER', senderName: 'Juliana', content: 'Boa noite! Já sou cliente e quero adicionar mais 2 veículos ao plano.', messageType: 'text', read: true, timestamp: new Date(Date.now() - 5 * 3600000).toISOString() },
      { id: 'm14', senderType: 'BOT', senderName: 'Bot IA', content: 'Olá Juliana! Para adicionar veículos ao seu plano, basta entrar em contato com nosso suporte. Vou registrar sua solicitação e encaminhar para o time de CS!', messageType: 'text', read: true, timestamp: new Date(Date.now() - 5 * 3600000 + 30000).toISOString() },
      { id: 'm15', senderType: 'USER', senderName: 'Juliana', content: 'Obrigada!', messageType: 'text', read: true, timestamp: new Date(Date.now() - 4.9 * 3600000).toISOString() },
    ],
    _count: { messages: 3 },
    updatedAt: new Date(Date.now() - 4.9 * 3600000).toISOString(),
  },
  {
    id: 'conv-5',
    contactId: '5531966660004',
    contactName: 'Carlos Henrique',
    status: 'WAITING',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm16', senderType: 'USER', senderName: 'Carlos', content: 'Preciso de um orçamento para rastreamento de 30 veículos pesados para mineração.', messageType: 'text', read: false, timestamp: new Date(Date.now() - 5 * 60000).toISOString() },
    ],
    _count: { messages: 1 },
    updatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 'conv-6',
    contactId: 'ig.user.78923',
    contactName: 'Patricia Lima',
    status: 'BOT_HANDLING',
    agent: { id: 'agent-1', name: 'Assistente Rastremix' },
    channel: { id: 'ch-2', type: 'INSTAGRAM', name: 'Instagram @rastremix' },
    messages: [
      { id: 'm17', senderType: 'USER', senderName: 'Patricia', content: 'Vi um post sobre câmera ADAS. Como funciona a detecção de fadiga?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 45 * 60000).toISOString() },
      { id: 'm18', senderType: 'BOT', senderName: 'Bot IA', content: 'Olá Patricia! Nossa câmera DMS usa visão computacional para detectar: piscadas lentas (fadiga), olhar desviado (distração), cigarro/celular ao volante. Alertas em tempo real para gestores. Gostaria de saber mais?', messageType: 'text', read: true, timestamp: new Date(Date.now() - 44 * 60000).toISOString() },
    ],
    _count: { messages: 2 },
    updatedAt: new Date(Date.now() - 44 * 60000).toISOString(),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'agora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const STATUS_CONFIG = {
  WAITING:       { label: 'Aguardando', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  BOT_HANDLING:  { label: 'IA Ativa',   bg: 'bg-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-500'  },
  HUMAN_HANDLING:{ label: 'Operador',   bg: 'bg-violet-100',text: 'text-violet-700',dot: 'bg-violet-500' },
  RESOLVED:      { label: 'Resolvido',  bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400'  },
}
const CHANNEL_ICONS: Record<string, string> = {
  WHATSAPP_META: '💬',
  INSTAGRAM: '📷',
  WEBCHAT: '🌐',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

const AVATAR_COLORS = ['from-emerald-400 to-teal-500', 'from-blue-400 to-indigo-500', 'from-violet-400 to-purple-500', 'from-rose-400 to-pink-500', 'from-amber-400 to-orange-500']

function avatarColor(id: string) {
  const idx = id.charCodeAt(id.length - 1) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatInboxClient({ session }: { session: Session }) {
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConvMessage[]>([])
  const [filter, setFilter] = useState<'all' | 'WAITING' | 'BOT_HANDLING' | 'HUMAN_HANDLING' | 'mine'>('all')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [isMockMode] = useState(true) // usa mock data para demo
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Carrega conversas reais (se não mock) ──────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (isMockMode) return
    try {
      const params = new URLSearchParams()
      if (filter === 'mine') params.set('mine', '1')
      else if (filter !== 'all') params.set('status', filter)
      const r = await fetch(`/api/chat/conversations?${params}`)
      const d = await r.json()
      if (d.success) setConversations(d.conversations)
    } catch { /* silently fail */ }
  }, [filter, isMockMode])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Seleciona conversa ─────────────────────────────────────────────────────
  function selectConversation(conv: Conversation) {
    setSelected(conv)
    setMessages(conv.messages ?? [])
    // Marca mensagens como lidas no mock
    setConversations(prev => prev.map(c =>
      c.id === conv.id
        ? { ...c, messages: c.messages.map(m => ({ ...m, read: true })) }
        : c
    ))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // ── Scroll automático ao receber mensagem ─────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Envio de mensagem ──────────────────────────────────────────────────────
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !selected || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    const newMsg: ConvMessage = {
      id: `msg-${Date.now()}`,
      senderType: 'HUMAN',
      senderName: session.nome,
      content: text,
      messageType: 'text',
      read: true,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, newMsg])

    if (!isMockMode) {
      try {
        await fetch(`/api/chat/conversations/${selected.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, senderType: 'HUMAN' }),
        })
      } catch { /* silently fail */ }
    }

    setSending(false)
    inputRef.current?.focus()

    // Simula resposta do bot (apenas em mock mode)
    if (isMockMode && selected.status !== 'HUMAN_HANDLING') {
      setTimeout(() => {
        const botMsg: ConvMessage = {
          id: `msg-bot-${Date.now()}`,
          senderType: 'BOT',
          senderName: 'Bot IA',
          content: 'Entendido! Vou verificar as informações e retorno em instantes. 🤖',
          messageType: 'text',
          read: true,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, botMsg])
      }, 1200)
    }
  }

  // ── Assumir / Liberar Atendimento ──────────────────────────────────────────
  async function handleToggleIA() {
    if (!selected) return
    const isHuman = selected.status === 'HUMAN_HANDLING'
    const action = isHuman ? 'release' : 'assume'
    const newStatus = isHuman ? 'BOT_HANDLING' : 'HUMAN_HANDLING'

    if (!isMockMode) {
      await fetch(`/api/chat/conversations/${selected.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    }

    const updated = { ...selected, status: newStatus as Conversation['status'], assignedToId: isHuman ? undefined : session.userId }
    setSelected(updated)
    setConversations(prev => prev.map(c => c.id === selected.id ? updated : c))

    // Adiciona mensagem de sistema
    const sysMsg: ConvMessage = {
      id: `sys-${Date.now()}`,
      senderType: 'HUMAN',
      senderName: 'Sistema',
      content: isHuman ? '🤖 IA assumiu o atendimento.' : `👤 ${session.nome} assumiu o atendimento. IA pausada.`,
      messageType: 'text',
      read: true,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, sysMsg])
  }

  // ── Filtro e busca ──────────────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    if (filter === 'mine') return c.assignedToId === session.userId || c.status === 'HUMAN_HANDLING'
    if (filter !== 'all') return c.status === filter
    return true
  }).filter(c => {
    if (!search) return true
    return c.contactName.toLowerCase().includes(search.toLowerCase()) ||
           c.contactId.includes(search)
  })

  const unread = conversations.filter(c => c.messages?.some(m => !m.read && m.senderType === 'USER')).length

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-white">

      {/* ── Coluna 1: Lista de conversas ─────────────────────────────────── */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-slate-800">
              Caixa de Entrada
              {unread > 0 && <span className="ml-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unread}</span>}
            </h2>
            {isMockMode && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">Demo</span>
            )}
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contato..."
              className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
          </div>
        </div>

        {/* Filtro abas */}
        <div className="flex border-b border-slate-100 text-xs">
          {[
            { id: 'all',           label: `Todos (${conversations.length})` },
            { id: 'WAITING',       label: `Espera (${conversations.filter(c => c.status === 'WAITING').length})` },
            { id: 'BOT_HANDLING',  label: `IA (${conversations.filter(c => c.status === 'BOT_HANDLING').length})` },
            { id: 'HUMAN_HANDLING',label: 'Operador' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as typeof filter)}
              className={`flex-1 py-2.5 font-medium transition-all ${
                filter === f.id ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <div className="text-4xl mb-2">💬</div>
              Nenhuma conversa encontrada.
            </div>
          ) : filtered.map(conv => {
            const lastMsg = conv.messages?.[conv.messages.length - 1]
            const hasUnread = conv.messages?.some(m => !m.read && m.senderType === 'USER')
            const stConf = STATUS_CONFIG[conv.status]
            return (
              <button key={conv.id} onClick={() => selectConversation(conv)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-all border-b border-slate-100 ${
                  selected?.id === conv.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${avatarColor(conv.id)} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                    {initials(conv.contactName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm font-${hasUnread ? 'bold' : 'medium'} text-slate-800 truncate`}>{conv.contactName}</span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0 ml-1">{fmtTime(conv.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{CHANNEL_ICONS[conv.channel.type] ?? '💬'}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${stConf.bg} ${stConf.text}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${stConf.dot} mr-1`}/>
                        {stConf.label}
                      </span>
                    </div>
                    {lastMsg && (
                      <p className={`text-xs truncate ${hasUnread ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                        {lastMsg.senderType === 'BOT' ? '🤖 ' : lastMsg.senderType === 'HUMAN' ? '👤 ' : ''}
                        {lastMsg.content}
                      </p>
                    )}
                  </div>
                  {hasUnread && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-2"/>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Coluna 2: Chat ────────────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 bg-gradient-to-br ${avatarColor(selected.id)} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                {initials(selected.contactName)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800 text-sm">{selected.contactName}</h3>
                  <span className="text-slate-400 text-xs">{CHANNEL_ICONS[selected.channel.type]} {selected.channel.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selected.status].bg} ${STATUS_CONFIG[selected.status].text}`}>
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                  <span className="text-xs text-slate-400">Agente: {selected.agent.name}</span>
                </div>
              </div>
            </div>

            {/* Botão Assumir / Liberar IA */}
            <div className="flex items-center gap-2">
              <button onClick={handleToggleIA}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  selected.status === 'HUMAN_HANDLING'
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}>
                {selected.status === 'HUMAN_HANDLING' ? (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Devolver para IA</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> Assumir Atendimento</>
                )}
              </button>
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
            {messages.map((msg, idx) => {
              const isUser = msg.senderType === 'USER'
              const isBot  = msg.senderType === 'BOT'
              const isHuman= msg.senderType === 'HUMAN'

              // Mensagem de sistema
              if (isHuman && msg.senderName === 'Sistema') return (
                <div key={msg.id} className="flex justify-center">
                  <span className="bg-slate-200 text-slate-500 text-xs px-3 py-1 rounded-full">{msg.content}</span>
                </div>
              )

              return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? '' : 'flex-row-reverse'}`}>
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    isUser ? `bg-gradient-to-br ${avatarColor(selected.id)}` :
                    isBot  ? 'bg-gradient-to-br from-blue-400 to-indigo-500' :
                             'bg-gradient-to-br from-violet-400 to-purple-500'
                  }`}>
                    {isUser ? initials(selected.contactName) : isBot ? '🤖' : session.nome.charAt(0)}
                  </div>

                  <div className={`max-w-[72%] space-y-1 ${isUser ? '' : 'items-end flex flex-col'}`}>
                    <div className={`flex items-center gap-2 ${isUser ? '' : 'flex-row-reverse'}`}>
                      <span className="text-[11px] text-slate-400 font-medium">{msg.senderName}</span>
                      <span className="text-[10px] text-slate-300">{fmtTime(msg.timestamp)}</span>
                    </div>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      isUser ? 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm' :
                      isBot  ? 'bg-blue-600 text-white rounded-tr-sm' :
                               'bg-violet-600 text-white rounded-tr-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            {selected.status === 'BOT_HANDLING' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-600 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                A IA está gerenciando esta conversa. Clique em "Assumir Atendimento" para intervir.
              </div>
            )}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <button type="button" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              </button>
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
                placeholder={selected.status === 'HUMAN_HANDLING' ? 'Digite sua mensagem...' : 'Assumir atendimento para digitar...'}
                disabled={selected.status === 'BOT_HANDLING'}
                className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"/>
              <button type="submit" disabled={!input.trim() || sending || selected.status === 'BOT_HANDLING'}
                className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-xl flex items-center justify-center transition-all">
                {sending ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Estado vazio — nenhuma conversa selecionada */
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
          <div className="text-center max-w-xs">
            <div className="text-7xl mb-4">💬</div>
            <h3 className="text-slate-700 font-semibold text-lg mb-2">Caixa de Entrada Omnichannel</h3>
            <p className="text-slate-400 text-sm">Selecione uma conversa à esquerda para visualizar o histórico e interagir com o cliente.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full">💬 WhatsApp Business</span>
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full">📷 Instagram DM</span>
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full">🌐 Webchat</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Coluna 3: Painel de Contexto ─────────────────────────────────── */}
      {selected && (
        <div className="w-64 border-l border-slate-200 bg-white flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">Contexto do Contato</h3>
          </div>

          {/* Dados do contato */}
          <div className="p-4 border-b border-slate-100">
            <div className={`w-14 h-14 bg-gradient-to-br ${avatarColor(selected.id)} rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3`}>
              {initials(selected.contactName)}
            </div>
            <p className="text-center font-semibold text-slate-800 text-sm">{selected.contactName}</p>
            <p className="text-center text-slate-400 text-xs mt-0.5">{selected.contactId}</p>
            <div className="flex justify-center mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selected.status].bg} ${STATUS_CONFIG[selected.status].text}`}>
                {STATUS_CONFIG[selected.status].label}
              </span>
            </div>
          </div>

          {/* Info da conversa */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversa</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Canal</span>
                <span className="text-xs font-medium text-slate-600">{CHANNEL_ICONS[selected.channel.type]} {selected.channel.type === 'WHATSAPP_META' ? 'WhatsApp' : selected.channel.type === 'INSTAGRAM' ? 'Instagram' : 'Webchat'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Agente IA</span>
                <span className="text-xs font-medium text-slate-600 truncate ml-2">{selected.agent.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Mensagens</span>
                <span className="text-xs font-medium text-slate-600">{messages.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Iniciada</span>
                <span className="text-xs font-medium text-slate-600">{fmtTime(selected.messages?.[0]?.timestamp ?? selected.updatedAt)}</span>
              </div>
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="p-4 space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ações</h4>
            <button className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-all text-xs font-medium text-slate-600 border border-slate-200">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              Ver Lead no Funil
            </button>
            <button className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-all text-xs font-medium text-slate-600 border border-slate-200">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Registrar Proposta
            </button>
            <button className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all text-xs font-medium text-slate-600 border border-slate-200">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              Marcar como Resolvido
            </button>
          </div>

          {/* Tags (simulado) */}
          <div className="px-4 pb-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tags</h4>
            <div className="flex flex-wrap gap-1.5">
              {['Mineração', 'B2B', 'Frota Grande'].map(tag => (
                <span key={tag} className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
