'use client'

/**
 * /admin/agenda
 * Calendário admin — Gestão de disponibilidade e agendamentos
 *
 * Tabs:
 *  1. Agendamentos  — Calendário semanal/diário com cards de appts por slot
 *  2. Técnicos      — CRUD de técnicos vinculados às lojas
 *  3. Disponibilidade — Criar slots em lote (semana) por loja ou técnico
 */

import { useState, useEffect, useCallback } from 'react'

/* ────────── Tipos ────────── */
interface Technician {
  id: string
  name: string
  phone?: string
  email?: string
  status: string
  storeId?: string
  store?: { id: string; name: string; cidade?: string }
  slots?: { id: string; date: string; startTime: string; endTime: string; status: string }[]
}

interface Store {
  id: string
  name: string
  cidade?: string
  estado?: string
}

interface Appointment {
  id: string
  scheduledDate: string
  startTime: string
  endTime: string
  status: string
  clientName?: string
  clientPhone?: string
  plate?: string
  vehicleModel?: string
  notes?: string
  cancelReason?: string
  confirmedAt?: string
  completedAt?: string
  cancelledAt?: string
  order?: { id: string; orderNumber: string; planName?: string; netValue?: number }
  store?: { id: string; name: string; cidade?: string }
  technician?: { id: string; name: string; phone?: string }
}

/* ────────── Constantes ────────── */
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  PENDING:   { label: 'Pendente',   color: 'text-amber-700',  bg: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400'  },
  CONFIRMED: { label: 'Confirmado', color: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
  COMPLETED: { label: 'Concluído',  color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200',dot: 'bg-emerald-500'},
  CANCELLED: { label: 'Cancelado',  color: 'text-red-700',    bg: 'bg-red-50    border-red-200',    dot: 'bg-red-400'    },
}

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const DEFAULT_TIME_SLOTS = [
  { startTime: '08:00', endTime: '09:00' },
  { startTime: '09:00', endTime: '10:00' },
  { startTime: '10:00', endTime: '11:00' },
  { startTime: '11:00', endTime: '12:00' },
  { startTime: '13:00', endTime: '14:00' },
  { startTime: '14:00', endTime: '15:00' },
  { startTime: '15:00', endTime: '16:00' },
  { startTime: '16:00', endTime: '17:00' },
  { startTime: '17:00', endTime: '18:00' },
]

/* ────────── Helpers ────────── */
function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function formatDate(isoStr: string): string {
  const d = new Date(isoStr + 'T00:00:00')
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function currencyBR(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

/* ────────── Componente principal ────────── */
export default function AgendaAdminPage() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'technicians' | 'slots'>('appointments')

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <span className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </span>
            Agenda & Disponibilidade
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Gerencie técnicos, slots e agendamentos de instalação</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {([
            { key: 'appointments', label: 'Agendamentos',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { key: 'technicians',  label: 'Técnicos',          icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
            { key: 'slots',        label: 'Disponibilidade',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          ] as { key: typeof activeTab; label: string; icon: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon}/>
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'appointments' && <AppointmentsTab />}
          {activeTab === 'technicians'  && <TechniciansTab />}
          {activeTab === 'slots'        && <SlotsTab />}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1 — AGENDAMENTOS
══════════════════════════════════════════════════════════════════ */
function AppointmentsTab() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterStore,  setFilterStore]  = useState('')
  const [stores, setStores] = useState<Store[]>([])
  const [actionAppt, setActionAppt] = useState<Appointment | null>(null)
  const [actionStatus, setActionStatus] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [saving, setSaving] = useState(false)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: toDateStr(weekStart),
        endDate:   toDateStr(addDays(weekStart, 6)),
        limit: '200',
      })
      if (filterStatus) params.set('status', filterStatus)
      if (filterStore)  params.set('storeId', filterStore)
      const res = await fetch(`/api/admin/agenda/appointments?${params}`)
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    } finally {
      setLoading(false)
    }
  }, [weekStart, filterStatus, filterStore])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  useEffect(() => {
    fetch('/api/agenda/lojas')
      .then(r => r.json())
      .then(d => setStores(d.stores ?? []))
      .catch(() => {})
  }, [])

  async function handleAction() {
    if (!actionAppt || !actionStatus) return
    setSaving(true)
    try {
      const body: Record<string, string> = { id: actionAppt.id, status: actionStatus }
      if (actionStatus === 'CANCELLED' && cancelReason) body.cancelReason = cancelReason
      await fetch('/api/admin/agenda/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setActionAppt(null)
      setCancelReason('')
      fetchAppointments()
    } finally {
      setSaving(false)
    }
  }

  /* ── Agrupar por data ── */
  const byDate: Record<string, Appointment[]> = {}
  for (const a of appointments) {
    const d = a.scheduledDate.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(a)
  }

  /* ── KPIs rápidos ── */
  const total     = appointments.length
  const pending   = appointments.filter(a => a.status === 'PENDING').length
  const confirmed = appointments.filter(a => a.status === 'CONFIRMED').length
  const completed = appointments.filter(a => a.status === 'COMPLETED').length

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total semana',  value: total,     color: 'text-slate-700',   bg: 'bg-slate-50  border-slate-200'  },
          { label: 'Pendentes',     value: pending,   color: 'text-amber-700',   bg: 'bg-amber-50  border-amber-200'  },
          { label: 'Confirmados',   value: confirmed, color: 'text-blue-700',    bg: 'bg-blue-50   border-blue-200'   },
          { label: 'Concluídos',    value: completed, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-3 flex flex-col ${k.bg}`}>
            <span className="text-xs text-slate-500 font-medium">{k.label}</span>
            <span className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Navegação semana */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setWeekStart(d => addDays(d, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-700 px-2 min-w-[160px] text-center">
            {String(weekStart.getDate()).padStart(2,'0')}/{String(weekStart.getMonth()+1).padStart(2,'0')}
            {' — '}
            {String(addDays(weekStart,6).getDate()).padStart(2,'0')}/{String(addDays(weekStart,6).getMonth()+1).padStart(2,'0')}
            /{addDays(weekStart,6).getFullYear()}
          </span>
          <button onClick={() => setWeekStart(d => addDays(d, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <button onClick={() => setWeekStart(getWeekStart(new Date()))}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
          Hoje
        </button>

        {/* Filtros */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Todas as lojas</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="ml-auto flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${viewMode==='week' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            Semana
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${viewMode==='list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            Lista
          </button>
        </div>
      </div>

      {/* Calendário Semanal */}
      {viewMode === 'week' && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Header dias */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {weekDates.map((d, i) => {
              const isToday = toDateStr(d) === toDateStr(new Date())
              const count = byDate[toDateStr(d)]?.length ?? 0
              return (
                <div key={i} className={`px-2 py-3 text-center border-r last:border-0 border-slate-200 ${isToday ? 'bg-indigo-50' : ''}`}>
                  <p className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>{WEEK_DAYS[d.getDay()]}</p>
                  <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>{d.getDate()}</p>
                  {count > 0 && (
                    <span className="inline-block mt-1 text-[10px] font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5">
                      {count}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Body dias */}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-400">
              <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-7 min-h-[320px]">
              {weekDates.map((d, i) => {
                const dateStr = toDateStr(d)
                const dayAppts = byDate[dateStr] ?? []
                const isToday = dateStr === toDateStr(new Date())
                return (
                  <div key={i} className={`border-r last:border-0 border-slate-100 p-2 space-y-1.5 ${isToday ? 'bg-indigo-50/30' : ''}`}>
                    {dayAppts.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-xs text-slate-300">—</span>
                      </div>
                    ) : (
                      dayAppts.map(a => {
                        const s = STATUS_LABELS[a.status] ?? STATUS_LABELS.PENDING
                        return (
                          <button key={a.id} onClick={() => setActionAppt(a)}
                            className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs transition-all hover:shadow-sm ${s.bg}`}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`}/>
                              <span className={`font-semibold truncate ${s.color}`}>{a.startTime}</span>
                            </div>
                            <p className="truncate text-slate-700 font-medium">{a.clientName ?? a.order?.orderNumber ?? '—'}</p>
                            <p className="truncate text-slate-400">{a.technician?.name ?? a.store?.name ?? ''}</p>
                          </button>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Carregando...</div>
          ) : appointments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">Nenhum agendamento neste período.</div>
          ) : (
            appointments.map(a => {
              const s = STATUS_LABELS[a.status] ?? STATUS_LABELS.PENDING
              return (
                <div key={a.id} className={`rounded-xl border p-4 flex gap-4 items-start ${s.bg}`}>
                  <div className="flex-shrink-0 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 w-14 h-14 shadow-sm">
                    <p className="text-lg font-bold text-slate-800 leading-none">
                      {new Date(a.scheduledDate + 'T00:00:00').getDate()}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {MONTHS[new Date(a.scheduledDate + 'T00:00:00').getMonth()].slice(0,3).toUpperCase()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-slate-500">{a.startTime} — {a.endTime}</span>
                      {a.order && <span className="text-xs text-slate-400">#{a.order.orderNumber}</span>}
                    </div>
                    <p className="font-semibold text-slate-800 truncate">{a.clientName ?? '—'}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {a.plate && <span className="text-xs text-slate-500">🚗 {a.plate}</span>}
                      {a.technician && <span className="text-xs text-slate-500">🔧 {a.technician.name}</span>}
                      {a.store && <span className="text-xs text-slate-500">📍 {a.store.name}</span>}
                      {a.order?.planName && <span className="text-xs text-slate-500">📦 {a.order.planName}</span>}
                      {a.order?.netValue && <span className="text-xs text-slate-500 font-medium">{currencyBR(a.order.netValue)}</span>}
                    </div>
                  </div>
                  <button onClick={() => setActionAppt(a)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    Ações
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Modal de ações */}
      {actionAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Agendamento</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {formatDate(actionAppt.scheduledDate)} às {actionAppt.startTime}
                  </p>
                </div>
                <button onClick={() => setActionAppt(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Detalhes */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <InfoRow label="Cliente"   value={actionAppt.clientName} />
                <InfoRow label="Placa"     value={actionAppt.plate} />
                <InfoRow label="Veículo"   value={actionAppt.vehicleModel} />
                <InfoRow label="Técnico"   value={actionAppt.technician?.name} />
                <InfoRow label="Loja"      value={actionAppt.store?.name} />
                <InfoRow label="Pedido"    value={actionAppt.order?.orderNumber} />
                <InfoRow label="Plano"     value={actionAppt.order?.planName} />
                {actionAppt.notes && <InfoRow label="Obs" value={actionAppt.notes} />}
                {actionAppt.cancelReason && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">
                    Motivo: {actionAppt.cancelReason}
                  </div>
                )}
              </div>

              {/* Alterar status */}
              {actionAppt.status !== 'COMPLETED' && actionAppt.status !== 'CANCELLED' && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Alterar status:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['CONFIRMED','COMPLETED','CANCELLED'] as const)
                      .filter(s => s !== actionAppt.status)
                      .map(s => {
                        const meta = STATUS_LABELS[s]
                        return (
                          <button key={s} onClick={() => setActionStatus(s)}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                              actionStatus === s ? `${meta.bg} ${meta.color} border-current ring-2 ring-offset-1` : `border-slate-200 text-slate-600 hover:${meta.bg}`
                            }`}>
                            {meta.label}
                          </button>
                        )
                      })
                    }
                  </div>

                  {actionStatus === 'CANCELLED' && (
                    <textarea
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Motivo do cancelamento (opcional)..."
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                    />
                  )}

                  <button onClick={handleAction} disabled={!actionStatus || saving}
                    className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {saving ? 'Salvando...' : 'Confirmar alteração'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 w-16 flex-shrink-0">{label}:</span>
      <span className="text-slate-700 font-medium">{value}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TAB 2 — TÉCNICOS
══════════════════════════════════════════════════════════════════ */
function TechniciansTab() {
  const [techs, setTechs] = useState<Technician[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTech, setEditTech] = useState<Technician | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', storeId: '', status: 'ACTIVE' })
  const [saving, setSaving] = useState(false)
  const [filterStore, setFilterStore] = useState('')

  const fetchTechs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStore) params.set('storeId', filterStore)
      const res = await fetch(`/api/admin/agenda/tecnicos?${params}`)
      const d = await res.json()
      setTechs(d.technicians ?? [])
    } finally {
      setLoading(false)
    }
  }, [filterStore])

  useEffect(() => { fetchTechs() }, [fetchTechs])

  useEffect(() => {
    fetch('/api/agenda/lojas')
      .then(r => r.json())
      .then(d => setStores(d.stores ?? []))
      .catch(() => {})
  }, [])

  function openCreate() {
    setEditTech(null)
    setForm({ name: '', phone: '', email: '', storeId: '', status: 'ACTIVE' })
    setShowForm(true)
  }

  function openEdit(t: Technician) {
    setEditTech(t)
    setForm({ name: t.name, phone: t.phone ?? '', email: t.email ?? '', storeId: t.storeId ?? '', status: t.status })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editTech) {
        // PATCH via tecnicos/[id] — usaremos o endpoint genérico
        await fetch(`/api/admin/agenda/tecnicos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, storeId: form.storeId || null }),
        })
      } else {
        await fetch('/api/admin/agenda/tecnicos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, storeId: form.storeId || null }),
        })
      }
      setShowForm(false)
      fetchTechs()
    } finally {
      setSaving(false)
    }
  }

  const activeCount   = techs.filter(t => t.status === 'ACTIVE').length
  const inactiveCount = techs.filter(t => t.status !== 'ACTIVE').length

  return (
    <div className="space-y-5">
      {/* Header com KPIs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-sm">
            <span className="font-bold text-emerald-700">{activeCount}</span>
            <span className="text-emerald-600 ml-1">ativos</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm">
            <span className="font-bold text-slate-600">{inactiveCount}</span>
            <span className="text-slate-500 ml-1">inativos</span>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">Todas as lojas</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Novo técnico
          </button>
        </div>
      </div>

      {/* Grid de técnicos */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando técnicos...</div>
      ) : techs.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Nenhum técnico cadastrado</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo técnico" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {techs.map(t => {
            const isActive = t.status === 'ACTIVE'
            const nextSlots = t.slots?.slice(0, 3) ?? []
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                    {t.store && (
                      <p className="text-xs text-slate-400 truncate">📍 {t.store.name}</p>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-500 mb-3">
                  {t.phone && <p>📞 {t.phone}</p>}
                  {t.email && <p>✉️ {t.email}</p>}
                </div>

                {nextSlots.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Próximos slots</p>
                    <div className="space-y-1">
                      {nextSlots.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"/>
                          <span className="text-slate-600">{formatDate(s.date.slice(0,10))} {s.startTime}–{s.endTime}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={() => openEdit(t)}
                  className="mt-3 w-full py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                  Editar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal novo/editar técnico */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                {editTech ? 'Editar técnico' : 'Novo técnico'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <FormField label="Nome *" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="João Silva" />
              <FormField label="Telefone" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))} placeholder="(11) 99999-9999" />
              <FormField label="E-mail" value={form.email} onChange={v => setForm(f => ({...f, email: v}))} placeholder="joao@empresa.com.br" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Loja</label>
                <select value={form.storeId} onChange={e => setForm(f => ({...f, storeId: e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">Sem loja vinculada</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name} — {s.cidade}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="ON_LEAVE">Afastado</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={!form.name.trim() || saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TAB 3 — DISPONIBILIDADE (criar slots em lote)
══════════════════════════════════════════════════════════════════ */
function SlotsTab() {
  const [stores, setStores] = useState<Store[]>([])
  const [techs, setTechs] = useState<Technician[]>([])
  const [slotType, setSlotType] = useState<'store' | 'technician'>('store')
  const [targetId, setTargetId] = useState('')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [selectedDays, setSelectedDays] = useState<boolean[]>([false,true,true,true,true,true,false])
  const [selectedTimes, setSelectedTimes] = useState<boolean[]>(Array(DEFAULT_TIME_SLOTS.length).fill(true))
  const [capacity, setCapacity] = useState(1)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ count: number; created: unknown[] } | null>(null)

  // Slots existentes para exibição
  const [existingSlots, setExistingSlots] = useState<{ date: string; startTime: string; endTime: string; status: string }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    fetch('/api/agenda/lojas').then(r => r.json()).then(d => setStores(d.stores ?? [])).catch(() => {})
    fetch('/api/admin/agenda/tecnicos').then(r => r.json()).then(d => setTechs(d.technicians ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!targetId) { setExistingSlots([]); return }
    setLoadingSlots(true)
    const params = new URLSearchParams({
      type: slotType,
      targetId,
      startDate: toDateStr(weekStart),
      endDate:   toDateStr(addDays(weekStart, 6)),
    })
    fetch(`/api/admin/agenda/slots?${params}`)
      .then(r => r.json())
      .then(d => setExistingSlots(d.slots ?? []))
      .catch(() => {})
      .finally(() => setLoadingSlots(false))
  }, [targetId, slotType, weekStart])

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  async function handleCreate() {
    if (!targetId) return
    setSaving(true)
    setResult(null)
    try {
      const dates = weekDates
        .filter((_, i) => selectedDays[i])
        .map(d => toDateStr(d))
      const timeSlots = DEFAULT_TIME_SLOTS.filter((_, i) => selectedTimes[i])
      if (dates.length === 0 || timeSlots.length === 0) return

      const res = await fetch('/api/admin/agenda/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: slotType,
          targetId,
          dates,
          timeSlots,
          capacity: slotType === 'store' ? capacity : undefined,
        }),
      })
      const data = await res.json()
      setResult(data)
      // Recarregar slots existentes
      const params = new URLSearchParams({ type: slotType, targetId, startDate: toDateStr(weekStart), endDate: toDateStr(addDays(weekStart, 6)) })
      const slots = await fetch(`/api/admin/agenda/slots?${params}`).then(r => r.json())
      setExistingSlots(slots.slots ?? [])
    } finally {
      setSaving(false)
    }
  }

  /* Agrupar slots existentes por dia */
  const existingByDate: Record<string, typeof existingSlots> = {}
  for (const s of existingSlots) {
    const d = s.date.slice(0, 10)
    if (!existingByDate[d]) existingByDate[d] = []
    existingByDate[d].push(s)
  }

  const totalNewSlots = selectedDays.filter(Boolean).length * selectedTimes.filter(Boolean).length
  const totalExisting = existingSlots.length

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel esquerdo — configuração */}
        <div className="space-y-5">
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3">1. Tipo de disponibilidade</p>
            <div className="grid grid-cols-2 gap-2">
              {(['store','technician'] as const).map(t => (
                <button key={t} onClick={() => { setSlotType(t); setTargetId('') }}
                  className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                    slotType === t
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-1 ring-indigo-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {t === 'store' ? '🏪 Por Loja' : '🔧 Por Técnico'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">
              2. Selecionar {slotType === 'store' ? 'loja' : 'técnico'}
            </p>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">— selecione —</option>
              {slotType === 'store'
                ? stores.map(s => <option key={s.id} value={s.id}>{s.name} — {s.cidade}</option>)
                : techs.map(t => <option key={t.id} value={t.id}>{t.name} {t.store ? `(${t.store.name})` : ''}</option>)
              }
            </select>
          </div>

          {/* Semana */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">3. Semana</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekStart(d => addDays(d,-7))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="flex-1 text-center text-sm font-medium text-slate-700">
                {String(weekStart.getDate()).padStart(2,'0')}/{String(weekStart.getMonth()+1).padStart(2,'0')}
                {' — '}
                {String(addDays(weekStart,6).getDate()).padStart(2,'0')}/{String(addDays(weekStart,6).getMonth()+1).padStart(2,'0')}
                /{addDays(weekStart,6).getFullYear()}
              </span>
              <button onClick={() => setWeekStart(d => addDays(d,7))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Dias da semana */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">4. Dias da semana</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEK_DAYS.map((d, i) => {
                const date = weekDates[i]
                const hasSome = (existingByDate[toDateStr(date)]?.length ?? 0) > 0
                return (
                  <button key={i} onClick={() => setSelectedDays(s => { const n=[...s]; n[i]=!n[i]; return n })}
                    className={`flex flex-col items-center py-2 rounded-xl border text-xs font-semibold transition-all ${
                      selectedDays[i]
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    <span>{d}</span>
                    <span className="text-[10px] mt-0.5 opacity-70">{date.getDate()}</span>
                    {hasSome && <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5"/>}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setSelectedDays([false,true,true,true,true,true,false])}
                className="text-xs text-indigo-600 hover:underline">Seg–Sex</button>
              <button onClick={() => setSelectedDays(Array(7).fill(true))}
                className="text-xs text-indigo-600 hover:underline">Todos</button>
              <button onClick={() => setSelectedDays(Array(7).fill(false))}
                className="text-xs text-slate-400 hover:underline">Limpar</button>
            </div>
          </div>

          {slotType === 'store' && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">Capacidade por slot</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setCapacity(c => Math.max(1,c-1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50">—</button>
                <span className="text-lg font-bold text-slate-800 w-8 text-center">{capacity}</span>
                <button onClick={() => setCapacity(c => c+1)}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50">+</button>
                <span className="text-xs text-slate-400">instalação(ões) simultâneas</span>
              </div>
            </div>
          )}
        </div>

        {/* Painel direito — horários */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-700">5. Horários</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedTimes(Array(DEFAULT_TIME_SLOTS.length).fill(true))}
                  className="text-xs text-indigo-600 hover:underline">Todos</button>
                <button onClick={() => setSelectedTimes(Array(DEFAULT_TIME_SLOTS.length).fill(false))}
                  className="text-xs text-slate-400 hover:underline">Limpar</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEFAULT_TIME_SLOTS.map((ts, i) => (
                <button key={i} onClick={() => setSelectedTimes(s => { const n=[...s]; n[i]=!n[i]; return n })}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    selectedTimes[i]
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {ts.startTime}–{ts.endTime}
                </button>
              ))}
            </div>
          </div>

          {/* Resumo e botão */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-700">Resumo</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Dias selecionados:</span>
                <span className="font-semibold text-slate-800">{selectedDays.filter(Boolean).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Horários selecionados:</span>
                <span className="font-semibold text-slate-800">{selectedTimes.filter(Boolean).length}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500">Slots a criar:</span>
                <span className="font-bold text-indigo-700">{totalNewSlots}</span>
              </div>
              {targetId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Já existentes:</span>
                  <span className="font-semibold text-emerald-600">{loadingSlots ? '...' : totalExisting}</span>
                </div>
              )}
            </div>

            <button onClick={handleCreate}
              disabled={!targetId || totalNewSlots === 0 || saving}
              className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Criando slots...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                  Criar {totalNewSlots} slot{totalNewSlots !== 1 ? 's' : ''}
                </>
              )}
            </button>

            {result && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
                <span>
                  <strong>{result.count}</strong> slots criados com sucesso!
                  {totalNewSlots - result.count > 0 && (
                    <span className="text-emerald-600"> ({totalNewSlots - result.count} já existiam)</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Preview slots existentes */}
          {targetId && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">
                Slots existentes nesta semana
                {loadingSlots && <span className="text-slate-400 font-normal ml-1">(carregando...)</span>}
              </p>
              {existingSlots.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum slot configurado para esta semana.</p>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map((d, i) => {
                    const daySlots = existingByDate[toDateStr(d)] ?? []
                    const isToday = toDateStr(d) === toDateStr(new Date())
                    return (
                      <div key={i} className={`rounded-xl border p-1.5 min-h-[60px] ${isToday ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                        <p className={`text-[10px] font-semibold text-center mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {WEEK_DAYS[d.getDay()]} {d.getDate()}
                        </p>
                        {daySlots.map((s, si) => (
                          <div key={si} className={`text-[9px] rounded px-1 py-0.5 mb-0.5 text-center font-medium ${
                            s.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700' :
                            s.status === 'BOOKED'    ? 'bg-blue-100    text-blue-700' :
                                                       'bg-slate-100   text-slate-500'
                          }`}>
                            {s.startTime}
                          </div>
                        ))}
                        {daySlots.length === 0 && (
                          <p className="text-[10px] text-slate-300 text-center">—</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
