'use client'

/**
 * WidgetVoiceCall.tsx
 * Widget completo de Voice AI para o perfil do lead
 *
 * Funcionalidades:
 *  - Botão "📞 Mandar IA Ligar" com confirmação
 *  - Status em tempo real via polling (atualiza a cada 3s)
 *  - Aba "Histórico de Ligações" com lista de chamadas
 *  - Modal de detalhes com transcrição, resumo e análise
 *  - Player de áudio inline para gravações
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mic,
  MicOff,
  Play,
  Pause,
  Volume2,
  Calendar,
  Thermometer,
  TrendingUp,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Bot,
  Star,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type CallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'FAILED'
  | 'CANCELED'

type LeadTemperature = 'COLD' | 'WARM' | 'HOT'

interface CallLogItem {
  id:                 string
  status:             CallStatus
  provider:           string
  providerCallId:     string | null
  agentName:          string
  durationSeconds:    number
  summary:            string | null
  callTemperature:    LeadTemperature | null
  sentiment:          'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null
  meetingScheduled:   boolean
  meetingScheduledAt: string | null
  recordingUrl:       string | null
  endedReason:        string | null
  callNotes:          string | null
  costCents:          number
  startedAt:          string | null
  endedAt:            string | null
  createdAt:          string
  hasTranscript:      boolean
}

interface TranscriptDetail {
  id:         string
  transcript: string | null
  summary:    string | null
  toolCalls:  Array<{ name: string; args: Record<string, string>; result: string; time: number }>
  analysis: {
    temperature:        LeadTemperature | null
    sentiment:          string | null
    meetingScheduled:   boolean
    meetingScheduledAt: string | null
  }
}

interface Lead {
  id:         string
  nomeCliente: string
  telefone:    string | null
}

interface Props {
  lead:     Lead
  agentId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const POLL_INTERVAL   = 3000 // ms — polling para status em tempo real
const ACTIVE_STATUSES: CallStatus[] = ['QUEUED', 'RINGING', 'IN_PROGRESS']

const STATUS_CONFIG: Record<CallStatus, {
  label:  string
  color:  string
  bg:     string
  ring:   string
  Icon:   React.FC<{ className?: string }>
  pulse?: boolean
}> = {
  QUEUED:      { label: 'Na fila',    color: 'text-amber-600',  bg: 'bg-amber-50',   ring: 'border-amber-200', Icon: Clock,       pulse: true },
  RINGING:     { label: 'Chamando',   color: 'text-blue-600',   bg: 'bg-blue-50',    ring: 'border-blue-200',  Icon: PhoneCall,   pulse: true },
  IN_PROGRESS: { label: 'Em ligação', color: 'text-emerald-600',bg: 'bg-emerald-50', ring: 'border-emerald-200',Icon: Mic,         pulse: true },
  COMPLETED:   { label: 'Concluída',  color: 'text-slate-600',  bg: 'bg-slate-50',   ring: 'border-slate-200', Icon: CheckCircle },
  NO_ANSWER:   { label: 'Não atendeu',color: 'text-orange-600', bg: 'bg-orange-50',  ring: 'border-orange-200',Icon: PhoneMissed },
  BUSY:        { label: 'Ocupado',    color: 'text-yellow-600', bg: 'bg-yellow-50',  ring: 'border-yellow-200',Icon: PhoneOff },
  FAILED:      { label: 'Falhou',     color: 'text-red-600',    bg: 'bg-red-50',     ring: 'border-red-200',   Icon: XCircle },
  CANCELED:    { label: 'Cancelada',  color: 'text-slate-500',  bg: 'bg-slate-50',   ring: 'border-slate-200', Icon: MicOff },
}

const TEMP_CONFIG: Record<LeadTemperature, { label: string; color: string; icon: string }> = {
  COLD: { label: 'Frio',    color: 'text-blue-500',   icon: '❄️' },
  WARM: { label: 'Morno',   color: 'text-amber-500',  icon: '🌡️' },
  HOT:  { label: 'Quente',  color: 'text-red-500',    icon: '🔥' },
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmtDuration(secs: number): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function fmtCost(cents: number): string {
  if (!cents) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO PLAYER MINI
// ─────────────────────────────────────────────────────────────────────────────
function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(p => !p)
  }

  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => setProgress((audioRef.current?.currentTime ?? 0) / (audioRef.current?.duration || 1) * 100)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />
      <button
        onClick={toggle}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex-shrink-0"
      >
        {playing
          ? <Pause className="w-3.5 h-3.5" />
          : <Play  className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-slate-500 flex-shrink-0 flex items-center gap-1">
        <Volume2 className="w-3 h-3" />
        {fmtDuration(Math.round(duration))}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CallDetailModal({
  call,
  leadId,
  onClose,
}: {
  call:   CallLogItem
  leadId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<TranscriptDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    if (!call.hasTranscript) return
    setLoading(true)
    fetch(`/api/voice/calls/${leadId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callLogId: call.id }),
    })
      .then(r => r.json())
      .then(d => setDetail(d as TranscriptDetail))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [call, leadId])

  const status   = STATUS_CONFIG[call.status]
  const StatusIcon = status.Icon

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${status.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${status.bg} border ${status.ring} flex items-center justify-center`}>
              <StatusIcon className={`w-5 h-5 ${status.color}`} />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Detalhes da Ligação</p>
              <p className={`text-sm ${status.color}`}>{status.label} • {fmtDate(call.createdAt)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {/* Métricas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-2xl font-bold text-slate-800">{fmtDuration(call.durationSeconds)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Duração</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-2xl font-bold text-slate-800">
                {call.callTemperature
                  ? TEMP_CONFIG[call.callTemperature].icon
                  : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {call.callTemperature ? TEMP_CONFIG[call.callTemperature].label : 'Temperatura'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className={`text-2xl font-bold ${
                call.sentiment === 'POSITIVE' ? 'text-emerald-600'
                : call.sentiment === 'NEGATIVE' ? 'text-red-600'
                : 'text-slate-600'
              }`}>
                {call.sentiment === 'POSITIVE' ? '😊'
                  : call.sentiment === 'NEGATIVE' ? '😟'
                  : '😐'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {call.sentiment === 'POSITIVE' ? 'Positivo'
                  : call.sentiment === 'NEGATIVE' ? 'Negativo'
                  : 'Neutro'}
              </p>
            </div>
          </div>

          {/* Reunião agendada */}
          {call.meetingScheduled && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <Calendar className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-800">✅ Reunião agendada!</p>
                <p className="text-sm text-emerald-700 mt-0.5">{fmtDate(call.meetingScheduledAt)}</p>
              </div>
            </div>
          )}

          {/* Resumo */}
          {call.summary && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> Resumo da IA
              </p>
              <p className="text-sm text-indigo-900 leading-relaxed">{call.summary}</p>
            </div>
          )}

          {/* Notas */}
          {call.callNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">
                Notas
              </p>
              <p className="text-sm text-amber-900">{call.callNotes}</p>
            </div>
          )}

          {/* Gravação */}
          {call.recordingUrl && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                🎙️ Gravação
              </p>
              <AudioPlayer url={call.recordingUrl} />
            </div>
          )}

          {/* Transcrição */}
          {call.hasTranscript && (
            <div>
              <button
                onClick={() => setShowTranscript(t => !t)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors w-full"
              >
                <MessageSquare className="w-4 h-4" />
                Transcrição completa
                {showTranscript ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
              </button>
              {showTranscript && (
                <div className="mt-3 bg-slate-900 rounded-xl p-4 text-sm text-slate-100 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {loading && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                  )}
                  {detail?.transcript ?? 'Transcrição não disponível'}
                </div>
              )}
            </div>
          )}

          {/* Tool calls */}
          {detail?.toolCalls && detail.toolCalls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                🔧 Funções acionadas
              </p>
              <div className="space-y-2">
                {detail.toolCalls.map((tc, i) => (
                  <div key={i} className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-violet-700">{tc.name}</p>
                    <p className="text-xs text-violet-600 mt-1">{JSON.stringify(tc.args)}</p>
                    {tc.result && (
                      <p className="text-xs text-emerald-700 mt-1">→ {tc.result}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-xs text-slate-400 space-y-0.5 border-t pt-4">
            <p>Agente: {call.agentName}</p>
            <p>Provider: {call.provider} • ID: {call.providerCallId ?? '—'}</p>
            <p>Motivo encerramento: {call.endedReason ?? '—'}</p>
            <p>Custo: {fmtCost(call.costCents)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE CALL BANNER
// ─────────────────────────────────────────────────────────────────────────────
function ActiveCallBanner({
  call,
  onCancel,
}: {
  call:     CallLogItem
  onCancel: () => void
}) {
  const status  = STATUS_CONFIG[call.status]
  const StatusIcon = status.Icon

  return (
    <div className={`rounded-xl border-2 ${status.ring} ${status.bg} p-4 flex items-center gap-4`}>
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 rounded-full ${status.bg} border-2 ${status.ring} flex items-center justify-center`}>
          <StatusIcon className={`w-6 h-6 ${status.color}`} />
        </div>
        {status.pulse && (
          <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
            call.status === 'IN_PROGRESS' ? 'bg-emerald-500' : 'bg-blue-500'
          } animate-ping`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${status.color}`}>{status.label}</p>
        <p className="text-sm text-slate-500 truncate">
          IA ligando para {call.agentName} • {fmtDate(call.createdAt)}
        </p>
      </div>
      <button
        onClick={onCancel}
        className="text-xs text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
      >
        Cancelar
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export default function WidgetVoiceCall({ lead, agentId }: Props) {
  const [tab, setTab]                 = useState<'dispatch' | 'history'>('dispatch')
  const [calls, setCalls]             = useState<CallLogItem[]>([])
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeCall, setActiveCall]   = useState<CallLogItem | null>(null)
  const [detailCall, setDetailCall]   = useState<CallLogItem | null>(null)
  const [toast, setToast]             = useState<{ type: 'success'|'error'; msg: string } | null>(null)
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch calls ──────────────────────────────────────────────
  const fetchCalls = useCallback(async () => {
    setLoadingCalls(true)
    try {
      const r = await fetch(`/api/voice/calls/${lead.id}`)
      const d = await r.json() as { calls: CallLogItem[] }
      setCalls(d.calls ?? [])
      const active = (d.calls ?? []).find(c => ACTIVE_STATUSES.includes(c.status)) ?? null
      setActiveCall(active)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingCalls(false)
    }
  }, [lead.id])

  useEffect(() => {
    fetchCalls()
  }, [fetchCalls])

  // ── Polling quando há chamada ativa ──────────────────────────
  useEffect(() => {
    if (activeCall) {
      pollRef.current = setInterval(fetchCalls, POLL_INTERVAL)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeCall, fetchCalls])

  // ── Toast auto-dismiss ───────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Dispatch ─────────────────────────────────────────────────
  const handleDispatch = async () => {
    setConfirmOpen(false)
    setDispatching(true)
    try {
      const r = await fetch('/api/voice/dispatch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadId: lead.id, agentId: agentId ?? undefined }),
      })
      const d = await r.json() as { message?: string; error?: string }
      if (!r.ok) throw new Error(d.error ?? 'Erro desconhecido')
      setToast({ type: 'success', msg: d.message ?? '📞 Ligação iniciada!' })
      await fetchCalls()
      setTab('history')
    } catch (err) {
      setToast({ type: 'error', msg: `Erro: ${err instanceof Error ? err.message : err}` })
    } finally {
      setDispatching(false)
    }
  }

  // ── Stats ─────────────────────────────────────────────────────
  const completedCalls = calls.filter(c => c.status === 'COMPLETED').length
  const meetingCount   = calls.filter(c => c.meetingScheduled).length
  const lastCall       = calls[0] ?? null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <Phone className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white leading-tight">Voz IA — Voice AI</p>
            <p className="text-emerald-200 text-xs">Ligações outbound automáticas</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {calls.length > 0 && (
            <button
              onClick={fetchCalls}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-200">
        {(['dispatch', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'dispatch' ? '📞 Ligar' : `📋 Histórico (${calls.length})`}
          </button>
        ))}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: DISPATCH
      ══════════════════════════════════════════════════════════ */}
      {tab === 'dispatch' && (
        <div className="p-5 space-y-5">

          {/* Lead info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
              {lead.nomeCliente.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-slate-800 leading-tight">{lead.nomeCliente}</p>
              <p className="text-sm text-slate-500">{lead.telefone ?? 'Sem telefone'}</p>
            </div>
          </div>

          {/* Chamada ativa */}
          {activeCall && (
            <ActiveCallBanner
              call={activeCall}
              onCancel={() => {
                // Futuro: cancelar via Vapi API
                setToast({ type: 'error', msg: 'Cancelamento de chamada em desenvolvimento.' })
              }}
            />
          )}

          {/* Stats rápidos */}
          {calls.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xl font-bold text-slate-800">{calls.length}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xl font-bold text-emerald-700">{completedCalls}</p>
                <p className="text-xs text-slate-500">Concluídas</p>
              </div>
              <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xl font-bold text-indigo-700">{meetingCount}</p>
                <p className="text-xs text-slate-500">Reuniões</p>
              </div>
            </div>
          )}

          {/* Última chamada */}
          {lastCall && !ACTIVE_STATUSES.includes(lastCall.status) && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Última ligação</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const s  = STATUS_CONFIG[lastCall.status]
                    const SI = s.Icon
                    return (
                      <>
                        <SI className={`w-4 h-4 ${s.color}`} />
                        <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                      </>
                    )
                  })()}
                </div>
                <span className="text-xs text-slate-400">{fmtDate(lastCall.createdAt)}</span>
              </div>
              {lastCall.summary && (
                <p className="text-xs text-slate-600 mt-2 line-clamp-2">{lastCall.summary}</p>
              )}
            </div>
          )}

          {/* Botão principal */}
          {!activeCall ? (
            !confirmOpen ? (
              <button
                onClick={() => {
                  if (!lead.telefone) {
                    setToast({ type: 'error', msg: 'Lead sem telefone cadastrado.' })
                    return
                  }
                  setConfirmOpen(true)
                }}
                disabled={dispatching}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2.5 shadow-sm"
              >
                <Phone className="w-5 h-5" />
                {dispatching ? 'Iniciando...' : '📞 Mandar IA Ligar'}
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900 text-sm">Confirmar ligação?</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      A IA irá ligar para <strong>{lead.nomeCliente}</strong> ({lead.telefone}).
                      Esta ação consome créditos Vapi.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDispatch}
                    disabled={dispatching}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    {dispatching
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ligando...</>
                      : <><Phone className="w-3.5 h-3.5" /> Confirmar</>}
                  </button>
                  <button
                    onClick={() => setConfirmOpen(false)}
                    className="flex-1 bg-white border border-slate-300 text-slate-600 font-medium py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-center text-slate-500 py-2">
              Aguardando encerramento da chamada ativa...
            </p>
          )}

          {!lead.telefone && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Cadastre um telefone para habilitar ligações.
            </p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: HISTÓRICO
      ══════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div className="divide-y divide-slate-100">
          {loadingCalls && (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}
          {!loadingCalls && calls.length === 0 && (
            <div className="p-8 text-center">
              <PhoneOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Nenhuma ligação registrada</p>
              <button
                onClick={() => setTab('dispatch')}
                className="mt-3 text-xs text-emerald-600 hover:underline"
              >
                Disparar a primeira ligação →
              </button>
            </div>
          )}
          {!loadingCalls && calls.map(call => {
            const s   = STATUS_CONFIG[call.status]
            const SI  = s.Icon
            const temp = call.callTemperature ? TEMP_CONFIG[call.callTemperature] : null
            const isActive = ACTIVE_STATUSES.includes(call.status)

            return (
              <button
                key={call.id}
                onClick={() => setDetailCall(call)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-start gap-3"
              >
                {/* Status icon */}
                <div className={`relative w-9 h-9 rounded-full ${s.bg} border ${s.ring} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <SI className={`w-4 h-4 ${s.color}`} />
                  {isActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-blue-500 animate-ping" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(call.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {call.durationSeconds > 0 && (
                      <span className="text-xs text-slate-500 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" /> {fmtDuration(call.durationSeconds)}
                      </span>
                    )}
                    {temp && (
                      <span className={`text-xs ${temp.color}`}>{temp.icon} {temp.label}</span>
                    )}
                    {call.meetingScheduled && (
                      <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                        <Calendar className="w-3 h-3" /> Reunião
                      </span>
                    )}
                    {call.recordingUrl && (
                      <span className="text-xs text-slate-500 flex items-center gap-0.5">
                        <Mic className="w-3 h-3" /> Gravação
                      </span>
                    )}
                  </div>
                  {call.summary && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{call.summary}</p>
                  )}
                </div>

                {/* Chevron */}
                <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1 -rotate-90" />
              </button>
            )
          })}
        </div>
      )}

      {/* Modal de detalhes */}
      {detailCall && (
        <CallDetailModal
          call={detailCall}
          leadId={lead.id}
          onClose={() => setDetailCall(null)}
        />
      )}
    </div>
  )
}
