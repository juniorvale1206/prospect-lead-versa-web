'use client'

import { useState, useEffect, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────── types */
interface Task {
  id: string
  title: string
  description?: string
  dueDate: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  leadId?: string
  userId: string
  tenantId?: string
  leadNome?: string
  leadEmpresa?: string
  leadTelefone?: string
  userName?: string
  createdAt: string
}

interface Props {
  role: string
  userId: string
  tenantId: string
}

const STATUS_CONFIG = {
  PENDING:     { label: 'Pendente',     color: 'bg-amber-100 text-amber-700 border-amber-300'   },
  IN_PROGRESS: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 border-blue-300'      },
  COMPLETED:   { label: 'Concluído',    color: 'bg-green-100 text-green-700 border-green-300'   },
  CANCELED:    { label: 'Cancelado',    color: 'bg-slate-100 text-slate-500 border-slate-300'   },
}

const MOCK_TASKS: Task[] = [
  { id: 'mock-1', title: 'Ligar para Carlos Mendes – Proposta Telemetria', description: 'Apresentar pacote de rastreamento para frota de 30 caminhões.', dueDate: new Date(Date.now() + 2 * 3600000).toISOString(), status: 'PENDING',    leadNome: 'Carlos Mendes',  leadEmpresa: 'Trans Mendes Ltda',     userName: 'Você', userId: '', tenantId: '', createdAt: new Date().toISOString() },
  { id: 'mock-2', title: 'Enviar contrato assinado – Vale Mineração',       description: 'Reencaminhar PDF com assinatura digital.',                        dueDate: new Date(Date.now() + 5 * 3600000).toISOString(), status: 'IN_PROGRESS', leadNome: 'João Silva',     leadEmpresa: 'Vale S.A.',             userName: 'Você', userId: '', tenantId: '', createdAt: new Date().toISOString() },
  { id: 'mock-3', title: 'Follow-up pós-demo – Rodovias do Sul',            description: 'Verificar feedback após demonstração do sistema ADAS.',           dueDate: new Date(Date.now() + 24 * 3600000).toISOString(),status: 'PENDING',    leadNome: 'Ana Oliveira',   leadEmpresa: 'Rodovias do Sul S.A.',  userName: 'Você', userId: '', tenantId: '', createdAt: new Date().toISOString() },
  { id: 'mock-4', title: 'Onboarding – Mineração Carajás',                  description: 'Agendar instalação dos sensores na frota pesada.',                 dueDate: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'PENDING',    leadNome: 'Pedro Costa',    leadEmpresa: 'Mineração Carajás',     userName: 'Você', userId: '', tenantId: '', createdAt: new Date().toISOString() },
  { id: 'mock-5', title: 'Renovação contrato anual – LogBrasil',            description: 'Processo finalizado com sucesso.',                                dueDate: new Date(Date.now() - 48 * 3600000).toISOString(),status: 'COMPLETED', leadNome: 'Fernanda Lima',  leadEmpresa: 'LogBrasil Transportes', userName: 'Você', userId: '', tenantId: '', createdAt: new Date().toISOString() },
]

/* ──────────────────────────────────────────────────────────── utils */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function isOverdue(iso: string, status: string) {
  return status === 'PENDING' || status === 'IN_PROGRESS'
    ? new Date(iso) < new Date()
    : false
}

/* ──────────────────────────────────────────────────────────── component */
export default function TarefasClient({ role, userId, tenantId }: Props) {
  const [tab, setTab] = useState<'lista' | 'calendario'>('lista')
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS)
  const [filter, setFilter] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [calMonth, setCalMonth] = useState(new Date())

  // Form state
  const [form, setForm] = useState({
    title: '', description: '', dueDate: '', dueTime: '09:00',
    status: 'PENDING', leadId: '', assignedUserId: ''
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tarefas', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.tasks?.length) setTasks(data.tasks)
      }
    } catch {
      // Usa mock em caso de erro
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const openCreate = () => {
    setEditTask(null)
    setForm({ title: '', description: '', dueDate: '', dueTime: '09:00', status: 'PENDING', leadId: '', assignedUserId: '' })
    setShowModal(true)
  }

  const openEdit = (t: Task) => {
    setEditTask(t)
    const d = new Date(t.dueDate)
    setForm({
      title: t.title, description: t.description || '',
      dueDate: d.toISOString().split('T')[0],
      dueTime: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
      status: t.status, leadId: t.leadId || '', assignedUserId: t.userId || ''
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.dueDate) { showToast('Título e data são obrigatórios.', 'error'); return }
    setSaving(true)
    const dueDateTime = new Date(`${form.dueDate}T${form.dueTime}:00`).toISOString()
    const typedStatus = form.status as Task['status']
    const payload = { title: form.title, description: form.description, dueDate: dueDateTime, status: typedStatus, leadId: form.leadId || undefined }

    // Otimista: atualiza local
    if (editTask) {
      setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...payload, userName: 'Você' } : t))
    } else {
      const newTask: Task = { ...payload, id: `local-${Date.now()}`, userId, tenantId, userName: 'Você', createdAt: new Date().toISOString(), status: typedStatus }
      setTasks(prev => [...prev, newTask])
    }

    try {
      if (editTask) {
        await fetch(`/api/tarefas/${editTask.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      } else {
        await fetch('/api/tarefas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      }
      showToast(editTask ? 'Tarefa atualizada!' : 'Tarefa criada!')
      fetchTasks()
    } catch {
      showToast('Erro ao salvar tarefa.', 'error')
    } finally {
      setSaving(false)
      setShowModal(false)
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as Task['status'] } : t))
    try {
      await fetch(`/api/tarefas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) })
    } catch { /* silencioso */ }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta tarefa?')) return
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await fetch(`/api/tarefas/${id}`, { method: 'DELETE', credentials: 'include' })
      showToast('Tarefa excluída.')
    } catch { /* silencioso */ }
  }

  // Filtros
  const filtered = tasks.filter(t => {
    if (filter !== 'ALL' && t.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.title.toLowerCase().includes(q) ||
             (t.leadNome || '').toLowerCase().includes(q) ||
             (t.leadEmpresa || '').toLowerCase().includes(q)
    }
    return true
  })

  // Stats
  const stats = {
    total:       tasks.length,
    pending:     tasks.filter(t => t.status === 'PENDING').length,
    inProgress:  tasks.filter(t => t.status === 'IN_PROGRESS').length,
    completed:   tasks.filter(t => t.status === 'COMPLETED').length,
    overdue:     tasks.filter(t => isOverdue(t.dueDate, t.status)).length,
  }

  /* ── Calendário ── */
  const buildCalendar = () => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    return cells
  }
  const calCells = buildCalendar()
  const tasksOnDay = (day: Date) => tasks.filter(t => {
    const d = new Date(t.dueDate)
    return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  })

  /* ─────────────────────────────────────────────── render */
  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm transition-all ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl">📋</span> Tarefas & Agenda
          </h1>
          <p className="text-slate-500 text-sm mt-1">Organize follow-ups, ligações e compromissos</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors shadow">
          <span className="text-lg leading-none">＋</span> Nova Tarefa
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total',       value: stats.total,      color: 'from-slate-500 to-slate-700',   icon: '📋' },
          { label: 'Pendentes',   value: stats.pending,    color: 'from-amber-400 to-amber-600',   icon: '⏳' },
          { label: 'Em Andamento',value: stats.inProgress, color: 'from-blue-400 to-blue-600',     icon: '🔄' },
          { label: 'Concluídas',  value: stats.completed,  color: 'from-emerald-400 to-emerald-600',icon: '✅' },
          { label: 'Vencidas',    value: stats.overdue,    color: 'from-red-400 to-red-600',       icon: '🚨' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-xl p-4 text-white shadow-sm`}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        {(['lista', 'calendario'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white shadow text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}>
            {t === 'lista' ? '📝 Lista de Tarefas' : '📅 Calendário'}
          </button>
        ))}
      </div>

      {/* ── LISTA ── */}
      {tab === 'lista' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-5">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Buscar por título ou lead..."
              className="flex-1 min-w-[200px] px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
            <div className="flex gap-2 flex-wrap">
              {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                  {s === 'ALL' ? 'Todas' : STATUS_CONFIG[s]?.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="flex justify-center py-16 text-slate-400">
              <svg className="animate-spin h-8 w-8 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Carregando tarefas...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-4">📭</div>
              <p className="font-medium">Nenhuma tarefa encontrada</p>
              <p className="text-sm mt-1">Crie sua primeira tarefa clicando em &quot;+ Nova Tarefa&quot;</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(task => {
                const overdue = isOverdue(task.dueDate, task.status)
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG['PENDING']
                return (
                  <div key={task.id}
                    className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all ${overdue ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                    <div className="flex items-start gap-4">
                      {/* Status checkbox */}
                      <button
                        onClick={() => handleStatusChange(task.id, task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED')}
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${task.status === 'COMPLETED' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}>
                        {task.status === 'COMPLETED' && <span className="text-white text-xs flex items-center justify-center h-full">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className={`font-semibold text-slate-800 text-sm leading-snug ${task.status === 'COMPLETED' ? 'line-through text-slate-400' : ''}`}>
                            {task.title}
                          </h3>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold whitespace-nowrap flex-shrink-0 ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>

                        {task.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-2.5">
                          {/* Data/Hora */}
                          <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-500' : 'text-slate-500'}`}>
                            {overdue ? '🚨' : '📅'} {fmtDate(task.dueDate)} às {fmtTime(task.dueDate)}
                            {overdue && ' · Vencida'}
                          </span>

                          {/* Lead */}
                          {(task.leadNome || task.leadEmpresa) && (
                            <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                              👤 {task.leadNome || task.leadEmpresa}
                            </span>
                          )}

                          {/* Responsável */}
                          {task.userName && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              🙋 {task.userName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <select value={task.status}
                          onChange={e => handleStatusChange(task.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 hidden sm:block">
                          <option value="PENDING">Pendente</option>
                          <option value="IN_PROGRESS">Em Andamento</option>
                          <option value="COMPLETED">Concluído</option>
                          <option value="CANCELED">Cancelado</option>
                        </select>
                        <button onClick={() => openEdit(task)} title="Editar"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          ✏️
                        </button>
                        <button onClick={() => handleDelete(task.id)} title="Excluir"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── CALENDÁRIO ── */}
      {tab === 'calendario' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Navegação mês */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">◀</button>
            <h2 className="font-bold text-slate-800 text-lg capitalize">
              {calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">▶</button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          {/* Grid de dias */}
          <div className="grid grid-cols-7">
            {calCells.map((day, i) => {
              const isToday = day && day.toDateString() === new Date().toDateString()
              const dayTasks = day ? tasksOnDay(day) : []
              return (
                <div key={i} className={`min-h-[90px] border-b border-r border-slate-50 p-1.5 ${!day ? 'bg-slate-50/50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                  {day && (
                    <>
                      <div className={`w-7 h-7 flex items-center justify-center text-sm font-semibold rounded-full mb-1 ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map(t => (
                          <div key={t.id} onClick={() => openEdit(t)}
                            className={`text-xs px-1.5 py-0.5 rounded-md truncate cursor-pointer font-medium ${
                              t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                              t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                              isOverdue(t.dueDate, t.status) ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-xs text-slate-400 pl-1">+{dayTasks.length - 3} mais</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODAL NOVA / EDITAR TAREFA ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
              <h2 className="text-lg font-bold text-slate-800">
                {editTask ? '✏️ Editar Tarefa' : '＋ Nova Tarefa'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>

            {/* Corpo */}
            <div className="p-6 space-y-4">
              {/* Título */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Título <span className="text-red-400">*</span></label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Ligar para João – proposta renovação"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes, roteiro da ligação, notas..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {/* Data + Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data <span className="text-red-400">*</span></label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Horário</label>
                  <input type="time" value={form.dueTime} onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="PENDING">⏳ Pendente</option>
                  <option value="IN_PROGRESS">🔄 Em Andamento</option>
                  <option value="COMPLETED">✅ Concluído</option>
                  <option value="CANCELED">❌ Cancelado</option>
                </select>
              </div>

              {/* Lead (opcional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lead associado (opcional)</label>
                <input value={form.leadId} onChange={e => setForm(f => ({ ...f, leadId: e.target.value }))}
                  placeholder="ID do lead (deixe em branco se não aplicável)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
              </div>
            </div>

            {/* Footer modal */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                {saving && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                {saving ? 'Salvando...' : editTask ? 'Salvar Alterações' : 'Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
