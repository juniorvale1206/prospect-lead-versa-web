'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════════════════════════════════════ */
type Role = 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER' | 'TEAM_LEADER'

interface Tenant {
  id:   string
  nome: string
  slug: string
}

interface SystemUser {
  id:        string
  nome:      string
  email:     string
  role:      Role
  ativo:     boolean
  telefone:  string | null
  avatarUrl: string | null
  createdAt: string
  tenant:    { id: string; nome: string } | null
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — exibido enquanto a API carrega
═══════════════════════════════════════════════════════════════════════════ */
const MOCK_USERS: SystemUser[] = [
  {
    id: 'mock-1', nome: 'Admin Master', email: 'admin@prospeclead.com',
    role: 'ADMIN_MASTER', ativo: true, telefone: '(31) 99000-0001',
    avatarUrl: null, createdAt: '2025-01-01T00:00:00Z', tenant: null,
  },
  {
    id: 'mock-2', nome: 'Carlos Financeiro', email: 'financeiro@prospeclead.com',
    role: 'FINANCIAL', ativo: true, telefone: '(31) 99000-0002',
    avatarUrl: null, createdAt: '2025-01-05T00:00:00Z', tenant: null,
  },
  {
    id: 'mock-3', nome: 'Ana Gestora Rastremix', email: 'ana.gestora@rastremix.com',
    role: 'MANAGER', ativo: true, telefone: '(31) 98877-3300',
    avatarUrl: null, createdAt: '2025-01-10T00:00:00Z',
    tenant: { id: 't1', nome: 'Rastremix' },
  },
  {
    id: 'mock-4', nome: 'Pedro Gestor Valeteck', email: 'pedro.gestor@valeteck.com',
    role: 'MANAGER', ativo: false, telefone: '(11) 97766-4411',
    avatarUrl: null, createdAt: '2025-01-15T00:00:00Z',
    tenant: { id: 't2', nome: 'Valeteck' },
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG DE ROLES — badges coloridos
═══════════════════════════════════════════════════════════════════════════ */
const ROLE_CONFIG: Record<Role | string, {
  label: string
  bg: string; text: string; border: string; dot: string
}> = {
  ADMIN_MASTER: {
    label: 'Admin Master',
    bg: 'bg-purple-50', text: 'text-purple-700',
    border: 'border-purple-200', dot: 'bg-purple-500',
  },
  FINANCIAL: {
    label: 'Financeiro',
    bg: 'bg-emerald-50', text: 'text-emerald-700',
    border: 'border-emerald-200', dot: 'bg-emerald-500',
  },
  MANAGER: {
    label: 'Gestor',
    bg: 'bg-blue-50', text: 'text-blue-700',
    border: 'border-blue-200', dot: 'bg-blue-500',
  },
  TEAM_LEADER: {
    label: 'Líder de Equipe',
    bg: 'bg-amber-50', text: 'text-amber-700',
    border: 'border-amber-200', dot: 'bg-amber-500',
  },
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN_MASTER', label: 'Admin Master'     },
  { value: 'FINANCIAL',    label: 'Financeiro'       },
  { value: 'MANAGER',      label: 'Gestor'           },
  { value: 'TEAM_LEADER',  label: 'Líder de Equipe'  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] ?? {
    label: role, bg: 'bg-slate-50', text: 'text-slate-600',
    border: 'border-slate-200', dot: 'bg-slate-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
      border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function Avatar({ nome, size = 'md' }: { nome: string; size?: 'sm' | 'md' }) {
  const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-slate-400 to-slate-600
      flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white font-bold">{initials}</span>
    </div>
  )
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
      ${ativo
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50   text-red-700   border-red-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ativo ? 'bg-green-500' : 'bg-red-400'}`} />
      {ativo ? 'Ativo' : 'Bloqueado'}
    </span>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function genPassword(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════════════ */
interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string }

function Toast({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
            border text-sm font-medium cursor-pointer max-w-sm transition-all
            ${t.type === 'success' ? 'bg-green-50  border-green-200  text-green-800'  :
              t.type === 'error'   ? 'bg-red-50    border-red-200    text-red-800'    :
                                     'bg-blue-50   border-blue-200   text-blue-800'}`}>
          <span className="text-base">
            {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
          </span>
          <span className="flex-1">{t.text}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL — CRIAR / EDITAR USUÁRIO
═══════════════════════════════════════════════════════════════════════════ */
interface ModalFormProps {
  user:       SystemUser | null     // null = criação
  tenants:    Tenant[]
  onClose:    () => void
  onSaved:    (u: SystemUser) => void
  onToast:    (type: ToastMsg['type'], text: string) => void
}

function ModalForm({ user, tenants, onClose, onSaved, onToast }: ModalFormProps) {
  const isEdit = !!user

  const [nome,     setNome]     = useState(user?.nome     ?? '')
  const [email,    setEmail]    = useState(user?.email    ?? '')
  const [telefone, setTelefone] = useState(user?.telefone ?? '')
  const [role,     setRole]     = useState<Role>(user?.role     ?? 'MANAGER')
  const [tenantId, setTenantId] = useState(user?.tenant?.id    ?? '')
  const [senha,    setSenha]    = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const overlayRef = useRef<HTMLDivElement>(null)

  function validate() {
    const e: Record<string, string> = {}
    if (!nome.trim())                   e.nome  = 'Nome obrigatório'
    if (!email.includes('@'))           e.email = 'E-mail inválido'
    if (!isEdit && senha.length < 6)    e.senha = 'Mínimo 6 caracteres'
    if (role === 'MANAGER' && !tenantId) e.tenantId = 'Gestor precisa de uma franquia'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)

    const payload: Record<string, unknown> = {
      nome, email, role, telefone,
      tenantId: tenantId || null,
    }
    if (senha) payload.senha = senha

    try {
      const url    = isEdit ? `/api/admin/usuarios/${user!.id}` : '/api/admin/usuarios'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido')
      onSaved(data.user)
      onToast('success', isEdit ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar usuário'
      onToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={overlayRef}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg
        border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100
          bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600
              flex items-center justify-center shadow-md shadow-blue-100">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isEdit
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>}
              </svg>
            </div>
            <div>
              <h3 className="text-slate-800 font-bold text-base">
                {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <p className="text-slate-400 text-xs">
                {isEdit ? `Editando: ${user!.nome}` : 'Preencha os dados do novo usuário'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center
              transition-colors text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nome Completo <span className="text-red-500">*</span>
            </label>
            <input
              value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Ana Paula da Silva"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-800
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all
                placeholder:text-slate-400
                ${errors.nome ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            />
            {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome}</p>}
          </div>

          {/* E-mail */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              E-mail (Login) <span className="text-red-500">*</span>
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-800
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all
                placeholder:text-slate-400
                ${errors.email ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Telefone</label>
            <input
              value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder="(31) 99999-9999"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white
                text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30
                hover:border-slate-300 transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Nível + Tenant — linha dupla */}
          <div className="grid grid-cols-2 gap-3">
            {/* Nível de Acesso */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Nível de Acesso <span className="text-red-500">*</span>
              </label>
              <select
                value={role} onChange={e => setRole(e.target.value as Role)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white
                  text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30
                  hover:border-slate-300 transition-all appearance-none cursor-pointer">
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Franquia / Tenant */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Franquia/Marca
                {role === 'MANAGER' && <span className="text-red-500"> *</span>}
              </label>
              <select
                value={tenantId} onChange={e => setTenantId(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30
                  hover:border-slate-300 transition-all appearance-none cursor-pointer
                  ${errors.tenantId ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
                <option value="">— Acesso Global —</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              {errors.tenantId && <p className="text-red-500 text-xs mt-1">{errors.tenantId}</p>}
            </div>
          </div>

          {/* Dica de regra de negócio */}
          {role === 'MANAGER' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200
              rounded-lg px-3 py-2 flex items-center gap-2">
              <span>⚠️</span>
              Gestores precisam de uma Franquia vinculada para restringir o acesso deles.
            </p>
          )}
          {(role === 'ADMIN_MASTER' || role === 'FINANCIAL') && !tenantId && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200
              rounded-lg px-3 py-2 flex items-center gap-2">
              <span>ℹ️</span>
              {role === 'ADMIN_MASTER' ? 'Admin Master' : 'Financeiro'} tem acesso global a todos os tenants.
            </p>
          )}

          {/* Senha */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Senha {!isEdit && <span className="text-red-500">*</span>}
                {isEdit && <span className="text-slate-400 font-normal"> (deixe em branco para manter)</span>}
              </label>
              <button type="button"
                onClick={() => { const p = genPassword(); setSenha(p); setShowPwd(true) }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium
                  hover:underline transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Gerar senha
              </button>
            </div>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={senha} onChange={e => setSenha(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Mín. 6 caracteres'}
                className={`w-full px-3.5 py-2.5 pr-10 rounded-xl border text-sm text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all
                  font-mono placeholder:font-sans placeholder:text-slate-400
                  ${errors.senha ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPwd
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>}
              </button>
            </div>
            {errors.senha && <p className="text-red-500 text-xs mt-1">{errors.senha}</p>}
            {senha && !errors.senha && (
              <p className="text-xs text-slate-400 mt-1 font-mono truncate">
                Senha: <span className="text-slate-700">{senha}</span>
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm
                font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700
                text-white text-sm font-semibold shadow-md shadow-blue-200
                hover:from-blue-700 hover:to-blue-800 transition-all
                disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading && <Spinner />}
              {loading ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL — CONFIRMAR AÇÃO (bloquear / excluir)
═══════════════════════════════════════════════════════════════════════════ */
interface ModalConfirmProps {
  user:     SystemUser
  action:   'block' | 'delete'
  onClose:  () => void
  onConfirm: () => void
  loading:   boolean
}

function ModalConfirm({ user, action, onClose, onConfirm, loading }: ModalConfirmProps) {
  const isBlock = action === 'block'
  const overlayRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={overlayRef}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200
        overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="p-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto
            ${isBlock
              ? (user.ativo ? 'bg-amber-100' : 'bg-green-100')
              : 'bg-red-100'}`}>
            {isBlock
              ? (user.ativo
                  ? <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                    </svg>
                  : <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>)
              : <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>}
          </div>

          <h3 className="text-slate-800 font-bold text-lg text-center mb-2">
            {isBlock
              ? (user.ativo ? 'Bloquear Usuário?' : 'Reativar Usuário?')
              : 'Excluir Usuário?'}
          </h3>
          <p className="text-slate-500 text-sm text-center mb-1">
            {isBlock
              ? (user.ativo
                  ? `O usuário ${user.nome} perderá acesso ao sistema imediatamente.`
                  : `O usuário ${user.nome} voltará a ter acesso ao sistema.`)
              : `Esta ação removerá permanentemente ${user.nome}. Caso tenha leads vinculados, será apenas bloqueado.`}
          </p>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm
                font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold
                shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2
                ${isBlock
                  ? (user.ativo
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                      : 'bg-green-600 hover:bg-green-700 shadow-green-200')
                  : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}>
              {loading && <Spinner />}
              {isBlock
                ? (user.ativo ? 'Bloquear' : 'Reativar')
                : 'Excluir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════════════════ */
export default function UsuariosClient({ currentUserId }: { currentUserId: string }) {
  const [users,   setUsers]   = useState<SystemUser[]>(MOCK_USERS)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filterRole,   setFilterRole]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // modais
  const [modalForm,    setModalForm]    = useState<{ open: boolean; user: SystemUser | null }>({ open: false, user: null })
  const [modalConfirm, setModalConfirm] = useState<{ open: boolean; user: SystemUser | null; action: 'block' | 'delete' }>({ open: false, user: null, action: 'block' })
  const [confirmLoad,  setConfirmLoad]  = useState(false)

  // toasts
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastRef = useRef(0)

  const addToast = useCallback((type: ToastMsg['type'], text: string) => {
    const id = ++toastRef.current
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  /* ── Fetch users ──────────────────────────────────────────────────────── */
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search',  search)
      if (filterRole)   params.set('role',    filterRole)
      if (filterStatus) params.set('status',  filterStatus)

      const res  = await fetch(`/api/admin/usuarios?${params}`)
      const data = await res.json()
      if (data.success) setUsers(data.users)
    } catch {
      // mantém mock se API falhar
    } finally {
      setLoading(false)
    }
  }, [search, filterRole, filterStatus])

  /* ── Fetch tenants ────────────────────────────────────────────────────── */
  const fetchTenants = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/tenants')
      const data = await res.json()
      if (Array.isArray(data)) setTenants(data)
      else if (Array.isArray(data.tenants)) setTenants(data.tenants)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { fetchUsers()  }, [fetchUsers])
  useEffect(() => { fetchTenants() }, [fetchTenants])

  /* ── Ação de bloquear/excluir ─────────────────────────────────────────── */
  async function handleConfirmAction() {
    if (!modalConfirm.user) return
    setConfirmLoad(true)
    const { user, action } = modalConfirm

    try {
      const url    = action === 'delete'
        ? `/api/admin/usuarios/${user.id}?mode=delete`
        : `/api/admin/usuarios/${user.id}`
      const method = action === 'delete' ? 'DELETE' : 'PATCH'
      const body   = action === 'block' ? JSON.stringify({ ativo: !user.ativo }) : undefined

      const res  = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')

      if (action === 'delete' && data.action === 'deleted') {
        setUsers(prev => prev.filter(u => u.id !== user.id))
        addToast('success', `Usuário ${user.nome} excluído.`)
      } else {
        const nextAtivo = data.user?.ativo ?? !user.ativo
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ativo: nextAtivo } : u))
        addToast('success', data.message ?? (nextAtivo ? `${user.nome} reativado.` : `${user.nome} bloqueado.`))
      }
      setModalConfirm({ open: false, user: null, action: 'block' })
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Erro ao processar ação')
    } finally {
      setConfirmLoad(false)
    }
  }

  /* ── Callback ao salvar no modal de form ──────────────────────────────── */
  function handleSaved(saved: SystemUser) {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [saved, ...prev]
    })
  }

  /* ── Estatísticas rápidas ─────────────────────────────────────────────── */
  const stats = {
    total:    users.length,
    ativos:   users.filter(u => u.ativo).length,
    admins:   users.filter(u => u.role === 'ADMIN_MASTER').length,
    gestores: users.filter(u => u.role === 'MANAGER').length,
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      <Toast toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />

      {modalForm.open && (
        <ModalForm
          user={modalForm.user}
          tenants={tenants}
          onClose={() => setModalForm({ open: false, user: null })}
          onSaved={handleSaved}
          onToast={addToast}
        />
      )}

      {modalConfirm.open && modalConfirm.user && (
        <ModalConfirm
          user={modalConfirm.user}
          action={modalConfirm.action}
          onClose={() => setModalConfirm({ open: false, user: null, action: 'block' })}
          onConfirm={handleConfirmAction}
          loading={confirmLoad}
        />
      )}

      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600
                flex items-center justify-center shadow-md shadow-purple-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Usuários do Sistema</h1>
            </div>
            <p className="text-slate-500 text-sm ml-12">
              Gerencie contas, níveis de acesso e permissões do painel web.
            </p>
          </div>
          <button
            onClick={() => setModalForm({ open: true, user: null })}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700
              text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-200
              hover:from-blue-700 hover:to-blue-800 transition-all flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Novo Usuário
          </button>
        </div>

        {/* ── Cards de estatísticas ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Usuários', value: stats.total,    color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200', icon: '👥' },
            { label: 'Ativos',            value: stats.ativos,   color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-200', icon: '✅' },
            { label: 'Admin Masters',     value: stats.admins,   color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200', icon: '🛡️' },
            { label: 'Gestores',          value: stats.gestores, color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',   icon: '🏢' },
          ].map(s => (
            <div key={s.label}
              className={`${s.bg} ${s.border} border rounded-2xl p-4 flex items-center gap-3`}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filtros ────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4
          flex flex-wrap gap-3 items-center shadow-sm">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchUsers()}
              placeholder="Buscar por nome ou e-mail…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50
                text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30
                focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Filtro Role */}
          <select
            value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50
              text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30
              hover:border-slate-300 transition-all appearance-none cursor-pointer">
            <option value="">Todos os níveis</option>
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Filtro Status */}
          <select
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50
              text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30
              hover:border-slate-300 transition-all appearance-none cursor-pointer">
            <option value="">Todos os status</option>
            <option value="ativo">Apenas Ativos</option>
            <option value="inativo">Apenas Bloqueados</option>
          </select>

          {/* Botão buscar */}
          <button onClick={fetchUsers}
            className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold
              hover:bg-slate-700 transition-all flex items-center gap-2">
            {loading ? <Spinner /> : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            )}
            Filtrar
          </button>
        </div>

        {/* ── Tabela ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Usuário
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Nível de Acesso
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Franquia / Tenant
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Criado em
                  </th>
                  <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <Spinner />
                        <span className="text-sm">Carregando usuários…</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                          </svg>
                        </div>
                        <p className="text-slate-400 font-medium">Nenhum usuário encontrado</p>
                        <p className="text-slate-300 text-xs">Tente ajustar os filtros ou crie um novo usuário</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id}
                      className="hover:bg-slate-50/70 transition-colors group">

                      {/* Usuário — avatar + nome + email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar nome={u.nome} />
                          <div className="min-w-0">
                            <p className="text-slate-800 font-semibold truncate max-w-[180px]">
                              {u.nome}
                              {u.id === currentUserId && (
                                <span className="ml-2 text-[10px] font-bold text-blue-600
                                  bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
                                  Você
                                </span>
                              )}
                            </p>
                            <p className="text-slate-400 text-xs truncate max-w-[180px]">{u.email}</p>
                            {u.telefone && (
                              <p className="text-slate-300 text-xs">{u.telefone}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Badge de Role */}
                      <td className="px-4 py-4">
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Tenant */}
                      <td className="px-4 py-4">
                        {u.tenant ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                            </svg>
                            {u.tenant.nome}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Acesso Global</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <StatusBadge ativo={u.ativo} />
                      </td>

                      {/* Data */}
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {fmtDate(u.createdAt)}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1.5">

                          {/* Editar */}
                          <button
                            onClick={() => setModalForm({ open: true, user: u })}
                            title="Editar usuário"
                            className="w-8 h-8 rounded-lg flex items-center justify-center
                              text-slate-400 hover:text-blue-600 hover:bg-blue-50
                              transition-all group-hover:opacity-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                          </button>

                          {/* Bloquear / Reativar */}
                          <button
                            onClick={() => setModalConfirm({ open: true, user: u, action: 'block' })}
                            title={u.ativo ? 'Bloquear acesso' : 'Reativar acesso'}
                            disabled={u.id === currentUserId}
                            className="w-8 h-8 rounded-lg flex items-center justify-center
                              text-slate-400 hover:text-amber-600 hover:bg-amber-50
                              transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                            {u.ativo
                              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                                </svg>
                              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>}
                          </button>

                          {/* Excluir */}
                          <button
                            onClick={() => setModalConfirm({ open: true, user: u, action: 'delete' })}
                            title="Excluir usuário"
                            disabled={u.id === currentUserId}
                            className="w-8 h-8 rounded-lg flex items-center justify-center
                              text-slate-400 hover:text-red-600 hover:bg-red-50
                              transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer da tabela */}
          {users.length > 0 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200
              flex items-center justify-between text-xs text-slate-500">
              <span>
                Exibindo <span className="font-semibold text-slate-700">{users.length}</span> usuário{users.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400"/>
                {stats.ativos} ativo{stats.ativos !== 1 ? 's' : ''}
                {' · '}
                <span className="w-2 h-2 rounded-full bg-red-400 ml-1"/>
                {stats.total - stats.ativos} bloqueado{(stats.total - stats.ativos) !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Legenda de permissões ────────────────────────────────────────── */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            Legenda — Níveis de Acesso
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ROLE_OPTIONS.map(o => {
              const cfg = ROLE_CONFIG[o.value]
              const desc: Record<string, string> = {
                ADMIN_MASTER: 'Acesso total — gerencia usuários, tenants e configurações globais',
                FINANCIAL:    'Acesso ao módulo financeiro — auditoria, comissões e KYC',
                MANAGER:      'Acesso operacional restrito ao próprio tenant/franquia',
                TEAM_LEADER:  'Acesso à equipe e leads da própria franquia',
              }
              return (
                <div key={o.value}
                  className={`${cfg.bg} ${cfg.border} border rounded-xl p-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`}/>
                    <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{desc[o.value]}</p>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </>
  )
}
