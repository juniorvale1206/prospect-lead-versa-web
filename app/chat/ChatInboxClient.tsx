'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Bot, User, AlertTriangle, Thermometer, Zap, Flame,
  Snowflake, MessageSquare, StickyNote, Send, Paperclip,
  RefreshCw, UserCheck, PhoneCall, CheckCheck, Eye,
  ChevronRight, Wifi, WifiOff, Clock, BarChart2, Info,
  BookOpen, Tag
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
export interface ConvMessage {
  id: string
  senderType: 'USER' | 'BOT' | 'HUMAN' | 'SYSTEM'
  senderName: string
  content: string
  messageType: string
  mediaUrl?: string
  read: boolean
  isInternalNote: boolean
  reaction?: string | null
  timestamp: string
}

export interface Qualification {
  isAiActive: boolean
  fallbackRequested: boolean
  leadTemperature: 'COLD' | 'WARM' | 'HOT'
  buyingIntent: string | null
  mainObjection: string | null
  engagementScore: number
  lastQualifiedAt: string | null
  status: string
  assignedToId: string | null
}

export interface Conversation {
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
  // Smart Inbox fields
  isAiActive?: boolean
  fallbackRequested?: boolean
  leadTemperature?: 'COLD' | 'WARM' | 'HOT'
  buyingIntent?: string | null
  mainObjection?: string | null
  engagementScore?: number
  followupCount?: number
}

interface Session {
  role: string
  nome: string
  userId: string
  tenantId: string | null
}

type InputTab = 'reply' | 'note'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuais
// ─────────────────────────────────────────────────────────────────────────────
const CHANNEL_ICONS: Record<string, string> = {
  WHATSAPP_META: '💬',
  INSTAGRAM:     '📷',
  WEBCHAT:       '🌐',
}

const STATUS_CONFIG = {
  WAITING:        { label: 'Aguardando',     bg: 'bg-amber-100',   text: 'text-amber-700',  dot: 'bg-amber-400' },
  BOT_HANDLING:   { label: 'Atendido por IA',bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-400'  },
  HUMAN_HANDLING: { label: 'Humano Ativo',   bg: 'bg-violet-100',  text: 'text-violet-700', dot: 'bg-violet-400'},
  RESOLVED:       { label: 'Resolvido',      bg: 'bg-slate-100',   text: 'text-slate-500',  dot: 'bg-slate-300' },
}

const TEMP_CONFIG = {
  COLD: { label: 'Frio',   color: 'text-blue-500',   bg: 'bg-blue-50 border-blue-200',   icon: Snowflake, bar: 'bg-blue-400'    },
  WARM: { label: 'Morno',  color: 'text-amber-500',  bg: 'bg-amber-50 border-amber-200', icon: Thermometer, bar: 'bg-amber-400' },
  HOT:  { label: 'Quente', color: 'text-rose-500',   bg: 'bg-rose-50 border-rose-200',   icon: Flame,      bar: 'bg-rose-500'   },
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',  'from-cyan-500 to-blue-600',
]

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data enriquecido com campos Smart Inbox
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1', contactId: '5511999990001', contactName: 'Ricardo Mendonça',
    status: 'WAITING', isAiActive: true, fallbackRequested: false,
    leadTemperature: 'HOT', buyingIntent: 'Quer proposta para 12 caminhões com sensor de fadiga',
    mainObjection: null, engagementScore: 82, followupCount: 0,
    agent: { id: 'a1', name: 'Assistente Rastremix' },
    channel: { id: 'c1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm1', senderType: 'USER', senderName: 'Ricardo', content: 'Olá! Tenho uma frota de 12 caminhões e quero rastreamento com sensor de fadiga. Qual o melhor plano?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 8 * 60000).toISOString() },
      { id: 'm2', senderType: 'BOT',  senderName: 'Bot IA',  content: 'Olá Ricardo! Para 12 caminhões com DMS (sensor de fadiga), temos o Plano Frota Pro — R$ 89/veículo/mês. Inclui rastreamento em tempo real, cercas eletrônicas e alertas de fadiga. Posso enviar uma proposta?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 7 * 60000).toISOString() },
      { id: 'm3', senderType: 'USER', senderName: 'Ricardo', content: 'Sim! Mas preciso saber se tem sensor de fadiga também para os motoristas. E vocês atendem o Pará?', messageType: 'text', read: false, isInternalNote: false, timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
    ],
    _count: { messages: 3 }, updatedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 'conv-2', contactId: '5511988880002', contactName: 'Mariana Costa',
    status: 'BOT_HANDLING', isAiActive: true, fallbackRequested: false,
    leadTemperature: 'WARM', buyingIntent: 'Avaliando sensor DMS para 5 veículos',
    mainObjection: 'Aguardando confirmação da diretoria', engagementScore: 58, followupCount: 1,
    agent: { id: 'a1', name: 'Assistente Rastremix' },
    channel: { id: 'c1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm4', senderType: 'USER', senderName: 'Mariana', content: 'Boa tarde! Vocês atendem SP capital com sensor de fadiga?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 35 * 60000).toISOString() },
      { id: 'm5', senderType: 'BOT',  senderName: 'Bot IA',  content: 'Boa tarde, Mariana! Atendemos SP capital e Grande SP. Nosso sensor DMS detecta fadiga, distração e celular. Qual o tamanho da sua frota?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 34 * 60000).toISOString() },
      { id: 'm6', senderType: 'USER', senderName: 'Mariana', content: 'Temos 3 vans e 2 caminhões fazendo entrega para a Vale.', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 30 * 60000).toISOString() },
      { id: 'm7', senderType: 'BOT',  senderName: 'Bot IA',  content: 'Perfeito! Para 5 veículos com DMS temos pacote especial. Qual o melhor horário para um consultor entrar em contato?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 28 * 60000).toISOString() },
      { id: 'm8', senderType: 'HUMAN', senderName: 'Lucas (Vendedor)', content: 'Deixa comigo Mariana, vou montar uma proposta personalizada pra você até amanhã cedo 👍', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 25 * 60000).toISOString() },
      { id: 'n1', senderType: 'HUMAN', senderName: 'Lucas (Vendedor)', content: '⚠️ Lembrar de mencionar o desconto de implementação no fechamento de contrato anual', messageType: 'text', read: true, isInternalNote: true, timestamp: new Date(Date.now() - 24 * 60000).toISOString() },
    ],
    _count: { messages: 5 }, updatedAt: new Date(Date.now() - 24 * 60000).toISOString(),
  },
  {
    id: 'conv-3', contactId: '5521977770003', contactName: 'Fernando Alves',
    status: 'HUMAN_HANDLING', isAiActive: false, fallbackRequested: true,
    leadTemperature: 'HOT', buyingIntent: 'Precisa de bloqueio remoto para 8 motos de delivery',
    mainObjection: null, engagementScore: 91, followupCount: 0,
    agent: { id: 'a1', name: 'Assistente Rastremix' },
    channel: { id: 'c2', type: 'INSTAGRAM', name: 'Instagram @rastremix' },
    messages: [
      { id: 'm9',  senderType: 'USER',  senderName: 'Fernando', content: 'Oi! Quero bloqueio de partida para minha frota de motos.', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 120 * 60000).toISOString() },
      { id: 'm10', senderType: 'BOT',   senderName: 'Bot IA',   content: 'Olá Fernando! Temos solução de bloqueio remoto por app para motos. Sua frota tem quantas unidades?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 119 * 60000).toISOString() },
      { id: 'm11', senderType: 'USER',  senderName: 'Fernando', content: 'Preciso falar com um atendente humano por favor, é urgente.', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 90 * 60000).toISOString() },
      { id: 'm12', senderType: 'HUMAN', senderName: 'Lucas (Operador)', content: 'Olá Fernando! Sou o Lucas. Pode me contar mais sobre a urgência?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 85 * 60000).toISOString() },
      { id: 'm13', senderType: 'USER',  senderName: 'Fernando', content: 'Tenho 8 motos de delivery. Uma foi roubada ontem. Preciso instalar o sistema urgente.', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 80 * 60000).toISOString() },
    ],
    _count: { messages: 5 }, updatedAt: new Date(Date.now() - 80 * 60000).toISOString(),
  },
  {
    id: 'conv-4', contactId: '5521966660004', contactName: 'Ana Oliveira',
    status: 'RESOLVED', isAiActive: false, fallbackRequested: false,
    leadTemperature: 'COLD', buyingIntent: null,
    mainObjection: 'Achou o preço elevado', engagementScore: 22, followupCount: 2,
    agent: { id: 'a1', name: 'Assistente Rastremix' },
    channel: { id: 'c1', type: 'WHATSAPP_META', name: 'WhatsApp Principal' },
    messages: [
      { id: 'm14', senderType: 'USER', senderName: 'Ana', content: 'Quanto custa o rastreador básico?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
      { id: 'm15', senderType: 'BOT',  senderName: 'Bot IA', content: 'Olá Ana! Nosso rastreador básico começa em R$ 49/mês por veículo. Quer que eu envie mais detalhes?', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 2 * 3600000 + 30000).toISOString() },
      { id: 'm16', senderType: 'USER', senderName: 'Ana', content: 'Achei caro. Obrigada.', messageType: 'text', read: true, isInternalNote: false, timestamp: new Date(Date.now() - 1 * 3600000).toISOString() },
    ],
    _count: { messages: 3 }, updatedAt: new Date(Date.now() - 60 * 60000).toISOString(),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const d   = new Date(iso)
  const now = new Date()
  const diffM = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffM < 1)  return 'agora'
  if (diffM < 60) return `${diffM}m`
  if (diffM < 1440) return `${Math.floor(diffM / 60)}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtTimeFull(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function initials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function avatarColor(id: string) {
  return AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length]
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

/* ── Badge de temperatura do lead ── */
function TempBadge({ temp, size = 'sm' }: { temp: 'COLD' | 'WARM' | 'HOT'; size?: 'xs' | 'sm' | 'md' }) {
  const cfg  = TEMP_CONFIG[temp]
  const Icon = cfg.icon
  const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
                  : size === 'sm' ? 'text-xs px-2 py-0.5 gap-1'
                  : 'text-sm px-2.5 py-1 gap-1.5'
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${cfg.bg} ${cfg.color} ${sizeClass}`}>
      <Icon className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'}/>
      {cfg.label}
    </span>
  )
}

/* ── Badge IA Ativo / Fallback ── */
function AiBadge({ isAiActive, fallbackRequested }: { isAiActive?: boolean; fallbackRequested?: boolean }) {
  if (fallbackRequested) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-orange-700">
      <AlertTriangle className="w-2.5 h-2.5"/> Fallback
    </span>
  )
  if (isAiActive) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700">
      <Bot className="w-2.5 h-2.5"/> IA Ativo
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 border border-violet-300 text-violet-700">
      <User className="w-2.5 h-2.5"/> Humano
    </span>
  )
}

/* ── Painel de Qualificação IA ── */
function QualificationPanel({ conv }: { conv: Conversation }) {
  const temp     = conv.leadTemperature || 'COLD'
  const tempCfg  = TEMP_CONFIG[temp]
  const TempIcon = tempCfg.icon
  const score    = conv.engagementScore || 0

  return (
    <div className="p-4 border-b border-slate-100 space-y-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <BarChart2 className="w-3.5 h-3.5"/> Qualificação IA
      </h4>

      {/* Temperatura */}
      <div className={`flex items-center justify-between p-2.5 rounded-xl border ${tempCfg.bg}`}>
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${tempCfg.color}`}>
          <TempIcon className="w-4 h-4"/>
          Lead {tempCfg.label}
        </span>
        <TempBadge temp={temp} size="xs"/>
      </div>

      {/* Score de engajamento */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-slate-500">Engajamento</span>
          <span className="text-xs font-bold text-slate-700">{score}/100</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tempCfg.bar}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Intenção de compra */}
      {conv.buyingIntent && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <div className="text-[10px] font-bold text-emerald-600 uppercase mb-0.5 flex items-center gap-1">
            <Zap className="w-3 h-3"/> Intenção
          </div>
          <p className="text-xs text-emerald-800 leading-relaxed">{conv.buyingIntent}</p>
        </div>
      )}

      {/* Objeção principal */}
      {conv.mainObjection && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
          <div className="text-[10px] font-bold text-amber-600 uppercase mb-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3"/> Objeção
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">{conv.mainObjection}</p>
        </div>
      )}

      {/* Fallback solicitado */}
      {conv.fallbackRequested && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-bold text-orange-700">Transbordo Solicitado</p>
            <p className="text-[10px] text-orange-600 mt-0.5">O lead pediu atendimento humano</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Input com abas Resposta / Nota Interna ── */
function SmartInput({
  disabled,
  sending,
  aiActive,
  onSend,
  onToggleIA,
}: {
  disabled:   boolean
  sending:    boolean
  aiActive:   boolean
  onSend:     (text: string, isNote: boolean) => Promise<void>
  onToggleIA: () => void
}) {
  const [tab,   setTab]  = useState<InputTab>('reply')
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isNote   = tab === 'note'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    await onSend(text, isNote)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className={`border-t transition-colors ${isNote ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>

      {/* Banner: IA ativa */}
      {aiActive && !isNote && (
        <div className="mx-4 mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
          <Bot className="w-4 h-4 flex-shrink-0"/>
          <span>A IA está gerenciando esta conversa.</span>
          <button
            type="button"
            onClick={onToggleIA}
            className="ml-auto text-xs font-bold text-blue-800 underline hover:no-underline whitespace-nowrap"
          >
            Assumir agora
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1">
        <button
          type="button"
          onClick={() => setTab('reply')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === 'reply'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5"/>
          Resposta
        </button>
        <button
          type="button"
          onClick={() => setTab('note')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === 'note'
              ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5"/>
          Nota Interna
        </button>

        {/* Indicador de modo nota */}
        {isNote && (
          <span className="ml-auto text-[10px] text-amber-600 font-semibold flex items-center gap-1">
            <Eye className="w-3 h-3"/> Invisível ao cliente
          </span>
        )}
      </div>

      {/* Área de texto */}
      <form onSubmit={handleSubmit} className="px-4 pb-3">
        <div className={`relative flex items-end gap-2 rounded-2xl border transition-all ${
          isNote
            ? 'border-amber-300 bg-amber-50 focus-within:ring-2 focus-within:ring-amber-300'
            : 'border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-400'
        }`}>
          {/* Ícone de nota */}
          {isNote && (
            <div className="absolute left-3 top-3 text-amber-400">
              <StickyNote className="w-4 h-4"/>
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled && !isNote}
            placeholder={
              isNote
                ? '📝 Nota interna — só sua equipe verá isso...'
                : disabled
                  ? 'Clique em "Assumir agora" para digitar...'
                  : 'Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)'
            }
            rows={2}
            className={`flex-1 resize-none px-4 py-3 bg-transparent text-sm focus:outline-none disabled:cursor-not-allowed leading-relaxed ${
              isNote ? 'pl-9 text-amber-800 placeholder-amber-400' : 'text-slate-700 placeholder-slate-400'
            }`}
          />

          <div className="flex items-center gap-1.5 p-2.5 pb-3">
            {/* Botão de anexo */}
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
              title="Anexar arquivo"
            >
              <Paperclip className="w-4 h-4"/>
            </button>

            {/* Botão de envio */}
            <button
              type="submit"
              disabled={(disabled && !isNote) || !input.trim() || sending}
              className={`p-2 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isNote
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200'
              }`}
              title={isNote ? 'Salvar nota interna' : 'Enviar mensagem (Enter)'}
            >
              {sending
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <Send className="w-4 h-4"/>
              }
            </button>
          </div>
        </div>

        {/* Nota sobre visibilidade */}
        {isNote && (
          <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
            <Info className="w-3 h-3"/>
            Esta nota é <strong>apenas interna</strong> — o cliente não será notificado.
          </p>
        )}
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatInboxClient({ session }: { session: Session }) {
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS)
  const [selected,      setSelected]      = useState<Conversation | null>(null)
  const [messages,      setMessages]      = useState<ConvMessage[]>([])
  const [filter,        setFilter]        = useState<'all' | 'WAITING' | 'BOT_HANDLING' | 'HUMAN_HANDLING' | 'mine'>('all')
  const [search,        setSearch]        = useState('')
  const [sending,       setSending]       = useState(false)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [qualification, setQualification] = useState<Qualification | null>(null)
  const [isMockMode]    = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll para o final quando chegam mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Selecionar conversa ── */
  function selectConversation(conv: Conversation) {
    setSelected(conv)
    setMessages(conv.messages || [])
    setQualification({
      isAiActive:        conv.isAiActive ?? true,
      fallbackRequested: conv.fallbackRequested ?? false,
      leadTemperature:   conv.leadTemperature ?? 'COLD',
      buyingIntent:      conv.buyingIntent ?? null,
      mainObjection:     conv.mainObjection ?? null,
      engagementScore:   conv.engagementScore ?? 0,
      lastQualifiedAt:   null,
      status:            conv.status,
      assignedToId:      conv.assignedToId ?? null,
    })
    // Marcar mensagens como lidas
    setConversations(prev =>
      prev.map(c => c.id === conv.id
        ? { ...c, messages: c.messages.map(m => ({ ...m, read: true })) }
        : c
      )
    )
  }

  /* ── Enviar mensagem ── */
  async function handleSend(text: string, isNote: boolean) {
    if (!selected || (!text.trim()) || sending) return
    setSending(true)

    const newMsg: ConvMessage = {
      id:             `tmp-${Date.now()}`,
      senderType:     isNote ? 'HUMAN' : (selected.status === 'HUMAN_HANDLING' ? 'HUMAN' : 'BOT'),
      senderName:     isNote ? `${session.nome} (nota)` : session.nome,
      content:        text.trim(),
      messageType:    'text',
      read:           true,
      isInternalNote: isNote,
      timestamp:      new Date().toISOString(),
    }

    // Otimistic update
    setMessages(prev => [...prev, newMsg])
    setConversations(prev =>
      prev.map(c => c.id === selected.id
        ? { ...c, messages: [...(c.messages || []), newMsg], updatedAt: new Date().toISOString() }
        : c
      )
    )

    if (!isMockMode) {
      try {
        const r = await fetch(`/api/chat/conversations/${selected.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            content:        text.trim(),
            senderType:     newMsg.senderType,
            isInternalNote: isNote,
          }),
        })
        if (!r.ok) throw new Error('Erro ao enviar')
      } catch {
        // Reverter em caso de erro
        setMessages(prev => prev.filter(m => m.id !== newMsg.id))
      }
    }

    setSending(false)
  }

  /* ── Toggle IA Ativo/Desativado ── */
  async function handleToggleIA() {
    if (!selected) return
    const nextAiActive  = !(qualification?.isAiActive ?? true)
    const nextStatus    = nextAiActive ? 'BOT_HANDLING' : 'HUMAN_HANDLING'

    setSelected(prev => prev ? { ...prev, isAiActive: nextAiActive, status: nextStatus as Conversation['status'] } : null)
    setQualification(prev => prev ? { ...prev, isAiActive: nextAiActive, status: nextStatus } : null)
    setConversations(prev =>
      prev.map(c => c.id === selected.id
        ? { ...c, isAiActive: nextAiActive, status: nextStatus as Conversation['status'] }
        : c
      )
    )

    // Mensagem de sistema
    const sysMsg: ConvMessage = {
      id:             `sys-${Date.now()}`,
      senderType:     'SYSTEM',
      senderName:     'Sistema',
      content:        nextAiActive
        ? '🤖 IA reativada para este atendimento'
        : `👤 ${session.nome} assumiu o atendimento`,
      messageType:    'text',
      read:           true,
      isInternalNote: false,
      timestamp:      new Date().toISOString(),
    }
    setMessages(prev => [...prev, sysMsg])

    if (!isMockMode) {
      await fetch(`/api/chat/conversations/${selected.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus, assignedToId: nextAiActive ? null : session.userId }),
      }).catch(console.error)
    }
  }

  /* ── Filtrar conversas ── */
  const filtered = conversations.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.contactName.toLowerCase().includes(q) &&
          !c.contactId.includes(q)) return false
    }
    if (filter === 'all') return true
    if (filter === 'mine') return c.assignedToId === session.userId
    return c.status === filter
  })

  const unread = conversations.filter(
    c => c.messages?.some(m => !m.read && m.senderType === 'USER')
  ).length

  /* ── Render ── */
  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ─── Coluna 1: Lista de Contatos ─────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-base">Caixa de Entrada</h2>
              {unread > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unread}
                </span>
              )}
            </div>
            <button
              onClick={() => {}}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <RefreshCw className="w-4 h-4"/>
            </button>
          </div>

          {/* Busca */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contatos..."
              className="w-full bg-slate-100 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>

          {/* Filtros rápidos */}
          <div className="flex gap-1 mt-2.5 flex-wrap">
            {([
              { id: 'all',           label: 'Todos'   },
              { id: 'WAITING',       label: '⚠️ Espera' },
              { id: 'BOT_HANDLING',  label: '🤖 IA'    },
              { id: 'HUMAN_HANDLING',label: '👤 Humano' },
            ] as const).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filter === f.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40"/>
              Nenhuma conversa encontrada
            </div>
          ) : filtered.map(conv => {
            const lastMsg    = conv.messages?.[conv.messages.length - 1]
            const hasUnread  = conv.messages?.some(m => !m.read && m.senderType === 'USER')
            const stCfg      = STATUS_CONFIG[conv.status]
            const isSelected = selected?.id === conv.id

            return (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-all ${
                  isSelected ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-11 h-11 bg-gradient-to-br ${avatarColor(conv.id)} rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                      {initials(conv.contactName)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${stCfg.dot}`}/>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm font-semibold truncate ${hasUnread ? 'text-slate-900' : 'text-slate-700'}`}>
                        {conv.contactName}
                      </span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">
                        {lastMsg ? fmtTime(lastMsg.timestamp) : ''}
                      </span>
                    </div>

                    <p className={`text-xs truncate mb-1.5 ${hasUnread ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                      {lastMsg ? (
                        lastMsg.isInternalNote ? `📝 ${lastMsg.content}` :
                        lastMsg.senderType === 'BOT' ? `🤖 ${lastMsg.content}` :
                        lastMsg.senderType === 'HUMAN' ? `👤 ${lastMsg.content}` :
                        lastMsg.content
                      ) : 'Sem mensagens'}
                    </p>

                    {/* Badges Smart Inbox */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${stCfg.bg} ${stCfg.text}`}>
                        {CHANNEL_ICONS[conv.channel?.type]} {stCfg.label}
                      </span>
                      <AiBadge isAiActive={conv.isAiActive} fallbackRequested={conv.fallbackRequested}/>
                      {conv.leadTemperature && conv.leadTemperature !== 'COLD' && (
                        <TempBadge temp={conv.leadTemperature} size="xs"/>
                      )}
                      {hasUnread && (
                        <span className="ml-auto w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"/>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Coluna 2: Janela de Chat ─────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header da conversa */}
          <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 bg-gradient-to-br ${avatarColor(selected.id)} rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                {initials(selected.contactName)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-800 text-sm">{selected.contactName}</h3>
                  <span className="text-slate-400 text-xs">{CHANNEL_ICONS[selected.channel.type]} {selected.channel.name}</span>
                  {qualification?.leadTemperature && (
                    <TempBadge temp={qualification.leadTemperature} size="xs"/>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selected.status].bg} ${STATUS_CONFIG[selected.status].text}`}>
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                  <AiBadge isAiActive={qualification?.isAiActive} fallbackRequested={qualification?.fallbackRequested}/>
                  <span className="text-xs text-slate-400">Agente: {selected.agent.name}</span>
                </div>
              </div>
            </div>

            {/* Ações do header */}
            <div className="flex items-center gap-2">
              {/* Toggle IA */}
              <button
                onClick={handleToggleIA}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  qualification?.isAiActive
                    ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                {qualification?.isAiActive
                  ? <><User className="w-3.5 h-3.5"/> Assumir</>
                  : <><Bot className="w-3.5 h-3.5"/> Devolver IA</>
                }
              </button>

              {/* Marcar resolvido */}
              <button
                onClick={() => {
                  setSelected(prev => prev ? { ...prev, status: 'RESOLVED' } : null)
                  setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'RESOLVED' } : c))
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5"/> Resolver
              </button>
            </div>
          </div>

          {/* Timeline de mensagens */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-slate-50/80">
            {messages.map((msg) => {
              const isUser   = msg.senderType === 'USER'
              const isBot    = msg.senderType === 'BOT'
              const isSystem = msg.senderType === 'SYSTEM'
              const isNote   = msg.isInternalNote

              // Mensagem de sistema (centralizada)
              if (isSystem) return (
                <div key={msg.id} className="flex justify-center py-1">
                  <span className="bg-slate-200/80 backdrop-blur-sm text-slate-500 text-xs px-4 py-1.5 rounded-full border border-slate-300/50 flex items-center gap-1.5">
                    <Info className="w-3 h-3"/>
                    {msg.content}
                  </span>
                </div>
              )

              // Nota interna (largura máxima, fundo amarelo)
              if (isNote) return (
                <div key={msg.id} className="flex justify-end py-1">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-1.5 justify-end mb-1">
                      <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                        <StickyNote className="w-3 h-3"/> Nota interna
                      </span>
                      <span className="text-[10px] text-slate-400">{fmtTimeFull(msg.timestamp)}</span>
                    </div>
                    <div className="bg-amber-100 border border-amber-300/60 text-amber-900 px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-amber-500 mt-1 text-right">{msg.senderName}</div>
                  </div>
                </div>
              )

              return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? '' : 'flex-row-reverse'}`}>
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ${
                    isUser ? `bg-gradient-to-br ${avatarColor(selected.id)}`
                           : isBot ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                           : 'bg-gradient-to-br from-violet-500 to-purple-600'
                  }`}>
                    {isUser ? initials(selected.contactName) : isBot ? '🤖' : session.nome.charAt(0)}
                  </div>

                  <div className={`max-w-[70%] space-y-1 ${isUser ? '' : 'items-end flex flex-col'}`}>
                    <div className={`flex items-center gap-2 ${isUser ? '' : 'flex-row-reverse'}`}>
                      <span className="text-[11px] text-slate-400 font-medium">{msg.senderName}</span>
                      <span className="text-[10px] text-slate-300">{fmtTimeFull(msg.timestamp)}</span>
                    </div>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      isUser ? 'bg-white text-slate-700 border border-slate-200/80 rounded-tl-sm'
                             : isBot ? 'bg-blue-600 text-white rounded-tr-sm'
                             : 'bg-violet-600 text-white rounded-tr-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* Input inteligente com abas */}
          <SmartInput
            disabled={qualification?.isAiActive ?? true}
            sending={sending}
            aiActive={qualification?.isAiActive ?? true}
            onSend={handleSend}
            onToggleIA={handleToggleIA}
          />
        </div>
      ) : (
        /* Estado vazio */
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
          <div className="text-center max-w-xs">
            <div className="text-7xl mb-4">💬</div>
            <h3 className="text-slate-700 font-bold text-lg mb-2">Smart Inbox Omnichannel</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Selecione uma conversa para visualizar o histórico e interagir com qualificação IA em tempo real.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">🤖 Qualificação IA</span>
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">📝 Notas Internas</span>
              <span className="bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">🔥 Lead Temp.</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Coluna 3: Painel de Contexto + Qualificação ──────────────────── */}
      {selected && (
        <div className="w-64 border-l border-slate-200 bg-white flex flex-col overflow-y-auto flex-shrink-0">

          {/* Cabeçalho */}
          <div className="p-4 border-b border-slate-100">
            <div className={`w-14 h-14 bg-gradient-to-br ${avatarColor(selected.id)} rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 shadow-md`}>
              {initials(selected.contactName)}
            </div>
            <p className="text-center font-bold text-slate-800 text-sm">{selected.contactName}</p>
            <p className="text-center text-slate-400 text-xs mt-0.5 font-mono">{selected.contactId}</p>
            <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selected.status].bg} ${STATUS_CONFIG[selected.status].text}`}>
                {STATUS_CONFIG[selected.status].label}
              </span>
            </div>
          </div>

          {/* Painel de Qualificação IA */}
          {qualification && (
            <QualificationPanel conv={{ ...selected, ...qualification, status: qualification.status as Conversation['status'], assignedToId: qualification.assignedToId ?? undefined }}/>
          )}

          {/* Info da conversa */}
          <div className="p-4 border-b border-slate-100 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5"/> Conversa
            </h4>
            {[
              { label: 'Canal', value: `${CHANNEL_ICONS[selected.channel.type]} ${selected.channel.type === 'WHATSAPP_META' ? 'WhatsApp' : selected.channel.type === 'INSTAGRAM' ? 'Instagram' : 'Webchat'}` },
              { label: 'Agente IA', value: selected.agent.name },
              { label: 'Mensagens', value: messages.filter(m => !m.isInternalNote).length.toString() },
              { label: 'Notas', value: messages.filter(m => m.isInternalNote).length.toString() },
              { label: 'Follow-ups', value: (selected.followupCount || 0).toString() },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{item.label}</span>
                <span className="text-xs font-medium text-slate-600 truncate ml-2">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Ações rápidas */}
          <div className="p-4 border-b border-slate-100 space-y-1.5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5"/> Ações
            </h4>
            {[
              { icon: UserCheck, label: 'Ver Lead no Funil', color: 'text-indigo-500' },
              { icon: PhoneCall, label: 'Registrar Ligação', color: 'text-emerald-500' },
              { icon: BookOpen, label: 'Criar Proposta', color: 'text-blue-500' },
              { icon: CheckCheck, label: 'Marcar Resolvido', color: 'text-slate-400' },
            ].map(({ icon: Icon, label, color }) => (
              <button key={label} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-xs font-medium text-slate-600 border border-slate-100 transition-all">
                <Icon className={`w-3.5 h-3.5 ${color}`}/>
                {label}
                <ChevronRight className="w-3 h-3 ml-auto text-slate-300"/>
              </button>
            ))}
          </div>

          {/* Tags */}
          <div className="p-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5"/> Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {['B2B', 'Mineração', 'Frota Grande', 'DMS'].map(tag => (
                <span key={tag} className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full border border-slate-200">
                  {tag}
                </span>
              ))}
              <button className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-slate-400 transition-all">
                + Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
