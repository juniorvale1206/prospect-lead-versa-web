'use client'

import { useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type PromotorRole   = 'PROMOTER' | 'PARTNER_EMPLOYEE'

interface Promotor {
  id:             string
  nome:           string
  email:          string
  telefone:       string
  cpf:            string
  fotoUrl:        string | null
  role:           PromotorRole
  tenant:         string
  tenantId:       string
  ativo:          boolean
  approvalStatus: ApprovalStatus
  createdAt:      string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const TENANTS = [
  { id: 't1', nome: 'Rastremix' },
  { id: 't2', nome: 'Valeteck'  },
  { id: 't3', nome: 'Gps Love'  },
]

const MOCK_PROMOTORES: Promotor[] = [
  {
    id: 'p1', nome: 'Ana Silva', email: 'ana.silva@rastremix.com',
    telefone: '(31) 98800-1111', cpf: '123.456.789-01',
    fotoUrl: null, role: 'PROMOTER', tenant: 'Rastremix', tenantId: 't1',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-01-10',
  },
  {
    id: 'p2', nome: 'João Costa', email: 'joao.costa@rastremix.com',
    telefone: '(31) 97711-2222', cpf: '234.567.890-12',
    fotoUrl: null, role: 'PROMOTER', tenant: 'Rastremix', tenantId: 't1',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-01-12',
  },
  {
    id: 'p3', nome: 'Mariana Ramos', email: 'mariana.ramos@valeteck.com',
    telefone: '(11) 96622-3333', cpf: '345.678.901-23',
    fotoUrl: null, role: 'PROMOTER', tenant: 'Valeteck', tenantId: 't2',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-01-15',
  },
  {
    id: 'p4', nome: 'Lucas Ferreira', email: 'lucas.ferreira@valeteck.com',
    telefone: '(11) 95533-4444', cpf: '456.789.012-34',
    fotoUrl: null, role: 'PROMOTER', tenant: 'Valeteck', tenantId: 't2',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-01-18',
  },
  {
    id: 'p5', nome: 'Carlos Promotor', email: 'promotor.rastremix@prospeclead.com',
    telefone: '(31) 98800-1234', cpf: '567.890.123-45',
    fotoUrl: null, role: 'PROMOTER', tenant: 'Rastremix', tenantId: 't1',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-02-01',
  },
  {
    id: 'p6', nome: 'Fernanda Souza', email: 'fernanda.souza@gpslove.com',
    telefone: '(21) 94455-6677', cpf: '678.901.234-56',
    fotoUrl: null, role: 'PARTNER_EMPLOYEE', tenant: 'Gps Love', tenantId: 't3',
    ativo: true, approvalStatus: 'APPROVED', createdAt: '2026-02-05',
  },
  {
    id: 'p7', nome: 'Roberto Lima', email: 'roberto.lima@gpslove.com',
    telefone: '(21) 93366-7788', cpf: '789.012.345-67',
    fotoUrl: null, role: 'PARTNER_EMPLOYEE', tenant: 'Gps Love', tenantId: 't3',
    ativo: false, approvalStatus: 'REJECTED', createdAt: '2026-02-08',
  },
]

// ─── Badges ───────────────────────────────────────────────────────────────────
function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const cfg = {
    APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Aprovado'  },
    PENDING:  { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Pendente'  },
    REJECTED: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Rejeitado' },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  )
}

function RoleBadge({ role }: { role: PromotorRole }) {
  return role === 'PROMOTER'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">Promotor de Rua</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">Funcionário PDV</span>
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ nome, fotoUrl, size = 'md' }: { nome: string; fotoUrl: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' }[size]
  const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nome} className={`${s} rounded-full object-cover border-2 border-white shadow-sm`}/>
  }
  return (
    <div className={`${s} rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 border-2 border-white shadow-sm`}>
      <span className="text-white font-bold">{initials}</span>
    </div>
  )
}

// ─── Modal Novo Promotor ──────────────────────────────────────────────────────
interface NovoModalProps {
  onClose: () => void
  onSave:  (p: Promotor) => void
}

function NovoPromotorModal({ onClose, onSave }: NovoModalProps) {
  const [form, setForm]     = useState({ nome: '', email: '', telefone: '', cpf: '', role: 'PROMOTER' as PromotorRole, tenantId: 't1' })
  const [foto, setFoto]     = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.nome.trim())     errs.nome     = 'Nome é obrigatório'
    if (!form.email.trim())    errs.email    = 'E-mail é obrigatório'
    if (!form.telefone.trim()) errs.telefone = 'Telefone é obrigatório'
    if (!form.cpf.trim())      errs.cpf      = 'CPF é obrigatório'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      let fotoUrl: string | null = null
      if (foto) {
        const fd = new FormData()
        fd.append('foto', foto)
        const res = await fetch('/api/admin/promotores/upload-foto', { method: 'POST', body: fd })
        if (res.ok) {
          const data = await res.json()
          fotoUrl = data.url
        }
      }
      const tenant = TENANTS.find(t => t.id === form.tenantId)
      const newP: Promotor = {
        id: `p${Date.now()}`,
        nome:           form.nome,
        email:          form.email,
        telefone:       form.telefone,
        cpf:            form.cpf,
        fotoUrl,
        role:           form.role,
        tenant:         tenant?.nome ?? '',
        tenantId:       form.tenantId,
        ativo:          true,
        approvalStatus: 'APPROVED',
        createdAt:      new Date().toISOString().slice(0, 10),
      }
      onSave(newP)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-xl border text-sm bg-white transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors[key] ? 'border-red-400' : 'border-slate-200'}`}
      />
      {errors[key] && <p className="text-red-500 text-[11px] mt-1">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-800">Novo Promotor</h2>
            <p className="text-slate-500 text-sm">Preencha os dados para cadastrar</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Foto Upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 flex-shrink-0">
              {preview
                ? <img src={preview} alt="preview" className="w-full h-full object-cover"/>
                : <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              }
            </div>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                {foto ? foto.name : 'Escolher foto'}
                <input type="file" accept="image/*" className="hidden" onChange={handleFile}/>
              </label>
              <p className="text-slate-400 text-[11px] mt-1">JPG, PNG até 5 MB</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{field('Nome completo', 'nome', 'text', 'Ex: João da Silva')}</div>
            {field('E-mail', 'email', 'email', 'joao@empresa.com')}
            {field('Telefone / WhatsApp', 'telefone', 'tel', '(11) 99999-0000')}
            {field('CPF', 'cpf', 'text', '000.000.000-00')}

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as PromotorRole }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="PROMOTER">Promotor de Rua</option>
                <option value="PARTNER_EMPLOYEE">Funcionário PDV</option>
              </select>
            </div>

            {/* Tenant */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Franquia / Marca</label>
              <select value={form.tenantId} onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {TENANTS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition shadow-sm shadow-emerald-200 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Salvando...</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Cadastrar Promotor</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal Editar ─────────────────────────────────────────────────────────────
interface EditModalProps {
  promotor: Promotor
  onClose:  () => void
  onSave:   (updated: Promotor) => void
}

function EditarModal({ promotor, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState({
    nome:     promotor.nome,
    telefone: promotor.telefone,
    role:     promotor.role,
    tenantId: promotor.tenantId,
    ativo:    promotor.ativo,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tenant = TENANTS.find(t => t.id === form.tenantId)
    onSave({ ...promotor, ...form, tenant: tenant?.nome ?? promotor.tenant })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Avatar nome={promotor.nome} fotoUrl={promotor.fotoUrl} size="md"/>
            <div>
              <h2 className="text-base font-black text-slate-800">Editar Promotor</h2>
              <p className="text-slate-400 text-xs">{promotor.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone</label>
            <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as PromotorRole }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="PROMOTER">Promotor de Rua</option>
                <option value="PARTNER_EMPLOYEE">Funcionário PDV</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Franquia</label>
              <select value={form.tenantId} onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {TENANTS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-sm text-slate-600 font-medium flex-1">Status da conta</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`}/>
            </button>
            <span className={`text-xs font-semibold ${form.ativo ? 'text-emerald-600' : 'text-slate-500'}`}>{form.ativo ? 'Ativo' : 'Bloqueado'}</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <span className="text-emerald-400 text-lg">✓</span>
      <span className="text-sm font-medium">{msg}</span>
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-white transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

// ─── Page Principal ───────────────────────────────────────────────────────────
export default function GestaoPromotoresPage() {
  const [promotores, setPromotores] = useState<Promotor[]>(MOCK_PROMOTORES)
  const [showNovo, setShowNovo]     = useState(false)
  const [editando, setEditando]     = useState<Promotor | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [filterRole, setFilterRole] = useState<string>('ALL')
  const [filterTenant, setFilterTenant] = useState<string>('ALL')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleNovoSave(p: Promotor) {
    setPromotores(prev => [p, ...prev])
    setShowNovo(false)
    showToast(`Promotor "${p.nome}" cadastrado com sucesso!`)
  }

  function handleEditSave(updated: Promotor) {
    setPromotores(prev => prev.map(p => p.id === updated.id ? updated : p))
    setEditando(null)
    showToast('Dados atualizados com sucesso!')
  }

  function handleBloqueio(id: string) {
    setPromotores(prev => prev.map(p => p.id === id ? { ...p, ativo: !p.ativo } : p))
    const p = promotores.find(x => x.id === id)
    showToast(p?.ativo ? `${p.nome} bloqueado.` : `${p?.nome} reativado.`)
  }

  // Filtros
  const filtered = promotores.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.nome.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.telefone.includes(q)
    const matchRole   = filterRole   === 'ALL' || p.role   === filterRole
    const matchTenant = filterTenant === 'ALL' || p.tenantId === filterTenant
    return matchSearch && matchRole && matchTenant
  })

  const totalAtivos    = promotores.filter(p => p.ativo).length
  const totalBloqueados = promotores.filter(p => !p.ativo).length
  const totalPendentes = promotores.filter(p => p.approvalStatus === 'PENDING').length

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">Gestão de Promotores</h1>
                <p className="text-slate-500 text-sm">Cadastro, controle e aprovação de promotores de campo</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalPendentes > 0 && (
              <a href="/admin/promotores/aprovacoes"
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-semibold hover:bg-amber-100 transition">
                <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[11px] font-black">{totalPendentes}</span>
                Fila de Aprovação
              </a>
            )}
            <button onClick={() => setShowNovo(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm shadow-sm shadow-emerald-200 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Novo Promotor
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Cadastrados', value: promotores.length,  color: 'text-slate-700', bg: 'bg-white'         },
            { label: 'Ativos',            value: totalAtivos,         color: 'text-emerald-700', bg: 'bg-emerald-50'  },
            { label: 'Bloqueados',        value: totalBloqueados,     color: 'text-red-600',     bg: 'bg-red-50'      },
            { label: 'Pendentes Aprv.',   value: totalPendentes,      color: 'text-amber-700',   bg: 'bg-amber-50'    },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-slate-100 rounded-2xl p-4 shadow-sm`}>
              <p className="text-slate-500 text-xs font-medium mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
            <option value="ALL">Todos os tipos</option>
            <option value="PROMOTER">Promotores de Rua</option>
            <option value="PARTNER_EMPLOYEE">Funcionários PDV</option>
          </select>
          <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
            <option value="ALL">Todas as franquias</option>
            {TENANTS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <span className="text-slate-400 text-xs">{filtered.length} resultado(s)</span>
        </div>

        {/* Tabela */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Promotor</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Contato</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Franquia</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Aprovação</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Nenhum promotor encontrado.</td></tr>
                )}
                {filtered.map((p, i) => (
                  <tr key={p.id} className={`hover:bg-slate-50/60 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    {/* Promotor */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar nome={p.nome} fotoUrl={p.fotoUrl} size="sm"/>
                        <div>
                          <p className="font-semibold text-slate-800">{p.nome}</p>
                          <p className="text-slate-400 text-[11px]">CPF: {p.cpf}</p>
                        </div>
                      </div>
                    </td>
                    {/* Contato */}
                    <td className="px-5 py-3.5">
                      <p className="text-slate-600">{p.email}</p>
                      <p className="text-slate-400 text-xs">{p.telefone}</p>
                    </td>
                    {/* Tipo */}
                    <td className="px-5 py-3.5"><RoleBadge role={p.role}/></td>
                    {/* Franquia */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">{p.tenant}</span>
                    </td>
                    {/* Aprovação */}
                    <td className="px-5 py-3.5"><ApprovalBadge status={p.approvalStatus}/></td>
                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {p.ativo
                        ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>Ativo</span>
                        : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-400"/>Bloqueado</span>
                      }
                    </td>
                    {/* Ações */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditando(p)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition" title="Editar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onClick={() => handleBloqueio(p.id)}
                          className={`p-1.5 rounded-lg transition ${p.ativo ? 'hover:bg-red-50 text-slate-400 hover:text-red-600' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}
                          title={p.ativo ? 'Bloquear' : 'Reativar'}>
                          {p.ativo
                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNovo  && <NovoPromotorModal onClose={() => setShowNovo(false)}  onSave={handleNovoSave}/>}
      {editando  && <EditarModal promotor={editando} onClose={() => setEditando(null)} onSave={handleEditSave}/>}
      {toast     && <Toast msg={toast} onClose={() => setToast(null)}/>}
    </div>
  )
}
