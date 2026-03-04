'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Plus, Edit2, ToggleLeft, ToggleRight, Building2,
  Users, Target, Cpu, ChevronDown, X, Check, AlertTriangle,
  Palette, Phone, Mail, MapPin, Shield, TrendingUp, Loader2,
  Eye, RefreshCw, Star, Zap
} from 'lucide-react'

/* ──────────────────────────────────── Types */
interface Tenant {
  id: string
  nome: string
  slug: string
  document?: string
  logoUrl?: string
  primaryColor?: string
  plan?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  city?: string
  state?: string
  maxUsers?: number
  maxLeads?: number
  ativo: boolean | number
  createdAt: string
  updatedAt: string
  userCount?: number
  leadCount?: number
  agentCount?: number
  campaignCount?: number
}

interface Stats {
  total: number
  active: number
  inactive: number
  plans: { STANDARD: number; PROFESSIONAL: number; ENTERPRISE: number }
}

/* ──────────────────────────────────── Constants */
const PLAN_CONFIG = {
  STANDARD:     { label: 'Standard',     color: 'bg-slate-100 text-slate-600 border-slate-200',      icon: <Shield className="w-3 h-3"/>,   dot: '#64748b' },
  PROFESSIONAL: { label: 'Professional', color: 'bg-indigo-100 text-indigo-700 border-indigo-200',   icon: <Star className="w-3 h-3"/>,     dot: '#6366f1' },
  ENTERPRISE:   { label: 'Enterprise',   color: 'bg-amber-100 text-amber-700 border-amber-200',      icon: <Zap className="w-3 h-3"/>,      dot: '#f59e0b' },
}

const PRESET_COLORS = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899',
  '#8b5cf6','#f97316','#14b8a6','#ef4444','#64748b',
]

const INITIAL_FORM = {
  nome: '', document: '', logoUrl: '', primaryColor: '#10b981',
  plan: 'STANDARD', contactName: '', contactEmail: '', contactPhone: '',
  city: '', state: '', maxUsers: 10, maxLeads: 1000, ativo: true,
}

/* ──────────────────────────────────── Helpers */
function maskCnpj(v: string) {
  const d = v.replace(/\D/g,'').slice(0,14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
}

function isActive(t: Tenant) {
  return t.ativo === true || t.ativo === 1
}

/* ──────────────────────────────────── Main Component */
export default function GestaoMarcasClient() {
  const [tenants, setTenants]   = useState<Tenant[]>([])
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPlan,   setFilterPlan]   = useState<string>('')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Detail drawer
  const [detailTenant, setDetailTenant] = useState<Tenant | null>(null)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success'|'error' } | null>(null)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── Fetch ── */
  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search', search)
      if (filterStatus) params.set('status', filterStatus)
      if (filterPlan)   params.set('plan',   filterPlan)
      const res = await fetch(`/api/admin/tenants?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (res.ok) { setTenants(data.tenants); setStats(data.stats) }
    } catch { /* usa mock */ } finally { setLoading(false) }
  }, [search, filterStatus, filterPlan])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  /* ── Modal helpers ── */
  const openCreate = () => {
    setEditTenant(null)
    setForm({ ...INITIAL_FORM })
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (t: Tenant) => {
    setEditTenant(t)
    setForm({
      nome: t.nome, document: t.document || '', logoUrl: t.logoUrl || '',
      primaryColor: t.primaryColor || '#10b981', plan: t.plan || 'STANDARD',
      contactName: t.contactName || '', contactEmail: t.contactEmail || '',
      contactPhone: t.contactPhone || '', city: t.city || '', state: t.state || '',
      maxUsers: t.maxUsers || 10, maxLeads: t.maxLeads || 1000, ativo: isActive(t),
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { setFormError('Nome da marca é obrigatório.'); return }
    setSaving(true); setFormError('')
    try {
      const url    = editTenant ? `/api/admin/tenants/${editTenant.id}` : '/api/admin/tenants'
      const method = editTenant ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Erro ao salvar'); return }

      showToast(editTenant ? `${form.nome} atualizada com sucesso!` : `${form.nome} criada com sucesso!`)
      setShowModal(false)
      fetchTenants()
    } catch { setFormError('Erro de conexão') } finally { setSaving(false) }
  }

  const handleToggle = async (t: Tenant) => {
    const newStatus = !isActive(t)
    setTenants(prev => prev.map(x => x.id === t.id ? { ...x, ativo: newStatus } : x))
    try {
      await fetch(`/api/admin/tenants/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ativo: newStatus }),
      })
      showToast(`${t.nome} ${newStatus ? 'ativada' : 'desativada'} com sucesso.`)
    } catch { fetchTenants() }
  }

  /* ──────────────────────────────────────── Render */
  return (
    <div className="max-w-7xl mx-auto -m-6 p-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] flex items-center gap-2.5 px-5 py-3.5 rounded-2xl shadow-xl text-white text-sm font-semibold transition-all animate-in slide-in-from-right-4 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
              <Building2 className="w-5 h-5 text-white"/>
            </div>
            Gestão de Marcas
          </h1>
          <p className="text-slate-400 text-sm mt-1 ml-11">Gerencie franquias e operações white-label do sistema</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-indigo-200 transition-all hover:scale-105 active:scale-95">
          <Plus className="w-4 h-4"/>
          Nova Marca
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total de Marcas',  value: stats?.total ?? tenants.length,    icon: <Building2 className="w-5 h-5"/>, color: 'from-indigo-500 to-indigo-700',   sub: 'franquias registradas' },
          { label: 'Marcas Ativas',    value: stats?.active ?? tenants.filter(isActive).length, icon: <Check className="w-5 h-5"/>,    color: 'from-emerald-400 to-emerald-600', sub: 'em operação' },
          { label: 'Inativas',         value: stats?.inactive ?? tenants.filter(t=>!isActive(t)).length, icon: <ToggleLeft className="w-5 h-5"/>, color: 'from-slate-400 to-slate-600',    sub: 'suspensas' },
          { label: 'Enterprise',       value: stats?.plans.ENTERPRISE ?? 0,      icon: <Zap className="w-5 h-5"/>,      color: 'from-amber-400 to-amber-600',     sub: 'plano top' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <div className="opacity-90">{s.icon}</div>
              <span className="text-3xl font-bold">{s.value}</span>
            </div>
            <div className="text-sm font-semibold leading-tight">{s.label}</div>
            <div className="text-xs opacity-75 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters Bar ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou e-mail..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5"/>
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700">
            <option value="">Todos os status</option>
            <option value="active">✅ Ativas</option>
            <option value="inactive">⏸️ Inativas</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"/>
        </div>

        {/* Plan filter */}
        <div className="relative">
          <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700">
            <option value="">Todos os planos</option>
            <option value="STANDARD">Standard</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"/>
        </div>

        <button onClick={fetchTenants} title="Atualizar lista"
          className="p-2.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
        </button>
      </div>

      {/* ── Data Table ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin"/>
            <span className="text-sm">Carregando marcas...</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4"/>
            <p className="text-slate-500 font-medium">Nenhuma marca encontrada</p>
            <p className="text-slate-400 text-sm mt-1">Clique em &quot;+ Nova Marca&quot; para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Marca', 'CNPJ', 'Plano', 'Contato', 'Métricas', 'Criado em', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenants.map(tenant => {
                  const active = isActive(tenant)
                  const planCfg = PLAN_CONFIG[tenant.plan as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.STANDARD
                  const color = tenant.primaryColor || '#10b981'

                  return (
                    <tr key={tenant.id} className={`hover:bg-slate-50/70 transition-colors ${!active ? 'opacity-60' : ''}`}>

                      {/* Marca */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar com cor da marca */}
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0 ring-2 ring-white"
                            style={{ background: `linear-gradient(135deg, ${color}cc, ${color})` }}>
                            {tenant.logoUrl
                              ? <img src={tenant.logoUrl} alt={tenant.nome} className="w-full h-full rounded-xl object-cover"/>
                              : getInitials(tenant.nome)
                            }
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{tenant.nome}</div>
                            <div className="text-xs text-slate-400 font-mono">/{tenant.slug}</div>
                          </div>
                        </div>
                      </td>

                      {/* CNPJ */}
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600 font-mono tabular-nums">
                          {tenant.document || <span className="text-slate-300 italic">—</span>}
                        </span>
                      </td>

                      {/* Plano */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${planCfg.color}`}>
                          {planCfg.icon}
                          {planCfg.label}
                        </span>
                      </td>

                      {/* Contato */}
                      <td className="px-4 py-4">
                        <div className="space-y-0.5">
                          {tenant.contactName && (
                            <div className="text-sm text-slate-700 font-medium">{tenant.contactName}</div>
                          )}
                          {tenant.contactEmail && (
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Mail className="w-3 h-3"/>
                              {tenant.contactEmail}
                            </div>
                          )}
                          {(tenant.city || tenant.state) && (
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <MapPin className="w-3 h-3"/>
                              {[tenant.city, tenant.state].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Métricas */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1" title="Usuários">
                            <Users className="w-3.5 h-3.5 text-indigo-400"/>
                            {Number(tenant.userCount) || 0}
                          </span>
                          <span className="flex items-center gap-1" title="Leads">
                            <Target className="w-3.5 h-3.5 text-emerald-400"/>
                            {Number(tenant.leadCount) || 0}
                          </span>
                          <span className="flex items-center gap-1" title="Agentes IA">
                            <Cpu className="w-3.5 h-3.5 text-purple-400"/>
                            {Number(tenant.agentCount) || 0}
                          </span>
                        </div>
                      </td>

                      {/* Data criação */}
                      <td className="px-4 py-4">
                        <span className="text-xs text-slate-400">{fmtDate(tenant.createdAt)}</span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}/>
                          {active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {/* Ver detalhes */}
                          <button onClick={() => setDetailTenant(tenant)} title="Ver detalhes"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Eye className="w-4 h-4"/>
                          </button>
                          {/* Editar */}
                          <button onClick={() => openEdit(tenant)} title="Editar marca"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Edit2 className="w-4 h-4"/>
                          </button>
                          {/* Toggle ativo/inativo */}
                          <button onClick={() => handleToggle(tenant)}
                            title={active ? 'Desativar marca' : 'Ativar marca'}
                            className={`p-1.5 rounded-lg transition-colors ${active ? 'text-emerald-500 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                            {active ? <ToggleRight className="w-4 h-4"/> : <ToggleLeft className="w-4 h-4"/>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer tabela */}
        {!loading && tenants.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 bg-slate-50/50">
            <span>{tenants.length} marca{tenants.length !== 1 ? 's' : ''} exibida{tenants.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"/>
                {tenants.filter(isActive).length} ativas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300"/>
                {tenants.filter(t => !isActive(t)).length} inativas
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL CRIAR / EDITAR ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-600"/>
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">{editTenant ? 'Editar Marca' : 'Nova Marca'}</h2>
                  <p className="text-xs text-slate-400">{editTenant ? `ID: ${editTenant.id}` : 'Preencha os dados da nova franquia'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* Corpo scrollável */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* Nome + Cor */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Nome da Marca <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Rastremix Telemetria"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Plano</label>
                  <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="STANDARD">Standard</option>
                    <option value="PROFESSIONAL">Professional</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              </div>

              {/* CNPJ */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">CNPJ</label>
                <input
                  value={form.document}
                  onChange={e => setForm(f => ({ ...f, document: maskCnpj(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={18}
                />
              </div>

              {/* Cor Principal */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  <Palette className="w-3.5 h-3.5 inline mr-1"/>
                  Cor Principal (White-Label)
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setForm(f => ({ ...f, primaryColor: c }))}
                        className={`w-7 h-7 rounded-lg transition-all hover:scale-110 ${form.primaryColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 p-0.5"/>
                    <input value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                      placeholder="#10b981" maxLength={7}
                      className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  {/* Preview avatar */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm ml-2"
                    style={{ background: `linear-gradient(135deg, ${form.primaryColor}cc, ${form.primaryColor})` }}>
                    {form.nome ? getInitials(form.nome) : 'AB'}
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">URL da Logo (opcional)</label>
                <input
                  value={form.logoUrl}
                  onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Contato */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5"/>Dados de Contato
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Nome do Responsável</label>
                    <input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                      placeholder="Carlos Eduardo"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Telefone</label>
                    <input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                      placeholder="(11) 99999-0000"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">E-mail</label>
                    <input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                      placeholder="contato@marca.com.br"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Cidade</label>
                    <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="São Paulo"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Estado</label>
                    <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione</option>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Limites do plano */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5"/>Limites do Plano
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Máx. Usuários</label>
                    <input type="number" min={1} value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Máx. Leads</label>
                    <input type="number" min={1} value={form.maxLeads} onChange={e => setForm(f => ({ ...f, maxLeads: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-700">Marca Ativa</div>
                  <div className="text-xs text-slate-400 mt-0.5">Permite acesso dos usuários desta franquia</div>
                </div>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 flex-shrink-0">
              <div className="text-xs text-slate-400">
                {editTenant ? `Última atualização: ${fmtDate(editTenant.updatedAt)}` : 'Novo registro'}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin"/>}
                  {saving ? 'Salvando...' : editTenant ? 'Salvar Alterações' : 'Criar Marca'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAIL DRAWER (painel lateral) ── */}
      {detailTenant && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDetailTenant(null)}/>
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden">

            {/* Header drawer */}
            <div className="px-6 py-5 flex-shrink-0 border-b border-slate-100"
              style={{ background: `linear-gradient(135deg, ${detailTenant.primaryColor || '#10b981'}18, white)` }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Detalhes da Marca</span>
                <button onClick={() => setDetailTenant(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                  <X className="w-4 h-4"/>
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${detailTenant.primaryColor || '#10b981'}cc, ${detailTenant.primaryColor || '#10b981'})` }}>
                  {detailTenant.logoUrl
                    ? <img src={detailTenant.logoUrl} alt="" className="w-full h-full rounded-2xl object-cover"/>
                    : getInitials(detailTenant.nome)
                  }
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{detailTenant.nome}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400 font-mono">/{detailTenant.slug}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isActive(detailTenant) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {isActive(detailTenant) ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Corpo drawer */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Métricas */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Usuários',  value: Number(detailTenant.userCount) || 0,    icon: <Users className="w-4 h-4"/>,  color: 'text-indigo-500'  },
                  { label: 'Leads',     value: Number(detailTenant.leadCount) || 0,    icon: <Target className="w-4 h-4"/>, color: 'text-emerald-500' },
                  { label: 'Agentes',   value: Number(detailTenant.agentCount) || 0,   icon: <Cpu className="w-4 h-4"/>,    color: 'text-purple-500'  },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className={`flex justify-center mb-1 ${m.color}`}>{m.icon}</div>
                    <div className="text-xl font-bold text-slate-800">{m.value}</div>
                    <div className="text-xs text-slate-400">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Info */}
              {[
                { icon: <Shield className="w-4 h-4 text-indigo-400"/>, label: 'Plano', value: PLAN_CONFIG[detailTenant.plan as keyof typeof PLAN_CONFIG]?.label || detailTenant.plan },
                { icon: <Building2 className="w-4 h-4 text-slate-400"/>, label: 'CNPJ', value: detailTenant.document || '—' },
                { icon: <Users className="w-4 h-4 text-slate-400"/>, label: 'Responsável', value: detailTenant.contactName || '—' },
                { icon: <Mail className="w-4 h-4 text-slate-400"/>, label: 'E-mail', value: detailTenant.contactEmail || '—' },
                { icon: <Phone className="w-4 h-4 text-slate-400"/>, label: 'Telefone', value: detailTenant.contactPhone || '—' },
                { icon: <MapPin className="w-4 h-4 text-slate-400"/>, label: 'Localização', value: [detailTenant.city, detailTenant.state].filter(Boolean).join(' – ') || '—' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="mt-0.5">{item.icon}</div>
                  <div>
                    <div className="text-xs text-slate-400">{item.label}</div>
                    <div className="text-sm text-slate-700 font-medium mt-0.5">{item.value}</div>
                  </div>
                </div>
              ))}

              {/* Cor principal */}
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full mt-0.5" style={{ background: detailTenant.primaryColor || '#10b981' }}/>
                <div>
                  <div className="text-xs text-slate-400">Cor Principal</div>
                  <div className="text-sm text-slate-700 font-mono">{detailTenant.primaryColor || '#10b981'}</div>
                </div>
              </div>

              {/* Limites */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-500 mb-3">Limites do Plano</div>
                <div className="space-y-2">
                  {[
                    { label: 'Usuários', value: Number(detailTenant.userCount) || 0, max: detailTenant.maxUsers || 10 },
                    { label: 'Leads',    value: Number(detailTenant.leadCount) || 0, max: detailTenant.maxLeads || 1000 },
                  ].map(l => {
                    const pct = Math.min(100, Math.round((l.value / l.max) * 100))
                    return (
                      <div key={l.label}>
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>{l.label}</span>
                          <span>{l.value.toLocaleString('pt-BR')} / {l.max.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: detailTenant.primaryColor || '#10b981' }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="text-xs text-slate-300 text-center pt-2">
                Criado em {fmtDate(detailTenant.createdAt)}
              </div>
            </div>

            {/* Footer drawer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
              <button onClick={() => { setDetailTenant(null); openEdit(detailTenant) }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors">
                <Edit2 className="w-4 h-4"/> Editar Marca
              </button>
              <button onClick={() => { handleToggle(detailTenant); setDetailTenant(null) }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${isActive(detailTenant) ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                {isActive(detailTenant) ? <><ToggleLeft className="w-4 h-4"/> Desativar</> : <><ToggleRight className="w-4 h-4"/> Ativar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
