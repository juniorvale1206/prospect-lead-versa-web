'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface Candidato {
  id:         string
  nome:       string
  email:      string
  cpf:        string
  telefone:   string
  fotoUrl:    string | null
  tenant:     string
  tenantId:   string
  role:       'PROMOTER' | 'PARTNER_EMPLOYEE'
  createdAt:  string
  status:     ApprovalStatus
  rejNote?:   string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_CANDIDATOS: Candidato[] = [
  {
    id: 'c1',
    nome:      'Pedro Henrique Alves',
    email:     'pedro.alves@gmail.com',
    cpf:       '111.222.333-44',
    telefone:  '(31) 99123-4567',
    fotoUrl:   null,
    tenant:    'Rastremix',
    tenantId:  't1',
    role:      'PROMOTER',
    createdAt: '2026-03-01',
    status:    'PENDING',
  },
  {
    id: 'c2',
    nome:      'Juliana Martins Costa',
    email:     'juliana.m.costa@outlook.com',
    cpf:       '222.333.444-55',
    telefone:  '(11) 98765-4321',
    fotoUrl:   null,
    tenant:    'Valeteck',
    tenantId:  't2',
    role:      'PARTNER_EMPLOYEE',
    createdAt: '2026-02-28',
    status:    'PENDING',
  },
]

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nome} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow"/>
  }
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center border-2 border-white shadow flex-shrink-0">
      <span className="text-white font-bold text-sm">{initials}</span>
    </div>
  )
}

// ─── Modal Rejeição ───────────────────────────────────────────────────────────
interface RejectModalProps {
  candidato: Candidato
  onConfirm: (note: string) => void
  onClose:   () => void
}

function ModalRejeicao({ candidato, onConfirm, onClose }: RejectModalProps) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-800">Rejeitar Candidato</h2>
          <p className="text-slate-500 text-sm mt-1">Informe o motivo da rejeição de <strong>{candidato.nome}</strong>.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Motivo (opcional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Ex: Documentação incompleta, CPF já cadastrado..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"/>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
            O candidato será notificado e não poderá acessar o app mobile enquanto estiver com status <strong>Rejeitado</strong>.
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={() => onConfirm(note)}
              className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              Rejeitar Cadastro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 ${
      type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
    }`}>
      <span className={type === 'success' ? 'text-emerald-400 text-lg' : 'text-white text-lg'}>
        {type === 'success' ? '✓' : '✕'}
      </span>
      <span className="text-sm font-medium">{msg}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

// ─── Card Candidato ───────────────────────────────────────────────────────────
interface CardCandidatoProps {
  candidato:  Candidato
  onAprovar:  (id: string) => void
  onRejeitar: (c: Candidato) => void
}

function CardCandidato({ candidato, onAprovar, onRejeitar }: CardCandidatoProps) {
  const roleLabel = candidato.role === 'PROMOTER' ? 'Promotor de Rua' : 'Funcionário PDV'
  const roleColor = candidato.role === 'PROMOTER' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
  const daysAgo   = Math.floor((Date.now() - new Date(candidato.createdAt).getTime()) / 86400000)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400"/>

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <Avatar nome={candidato.nome} fotoUrl={candidato.fotoUrl}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-base leading-tight">{candidato.nome}</h3>
                <p className="text-slate-500 text-sm mt-0.5">{candidato.email}</p>
              </div>
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>
                Pendente
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${roleColor}`}>{roleLabel}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">{candidato.tenant}</span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">CPF</p>
            <p className="text-slate-700 text-sm font-semibold">{candidato.cpf}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">WhatsApp</p>
            <a href={`https://wa.me/55${candidato.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
              className="text-emerald-600 text-sm font-semibold flex items-center gap-1 hover:underline">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {candidato.telefone}
            </a>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Data de Cadastro</p>
            <p className="text-slate-700 text-sm font-semibold">
              {new Date(candidato.createdAt).toLocaleDateString('pt-BR')}
              <span className="text-slate-400 font-normal text-xs ml-1">({daysAgo === 0 ? 'hoje' : `${daysAgo}d atrás`})</span>
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Franquia/PDV</p>
            <p className="text-slate-700 text-sm font-semibold">{candidato.tenant}</p>
          </div>
        </div>

        {/* Foto placeholder */}
        {!candidato.fotoUrl && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl mb-5 text-slate-500 text-xs">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Sem foto de perfil enviada
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3">
          <button onClick={() => onRejeitar(candidato)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            Rejeitar
          </button>
          <button onClick={() => onAprovar(candidato.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition shadow-sm shadow-emerald-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Aprovar e Liberar Acesso
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card Resultado ───────────────────────────────────────────────────────────
function CardResultado({ candidato }: { candidato: Candidato }) {
  const isApproved = candidato.status === 'APPROVED'
  return (
    <div className={`border rounded-2xl p-4 flex items-center gap-4 ${isApproved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <Avatar nome={candidato.nome} fotoUrl={candidato.fotoUrl}/>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800">{candidato.nome}</p>
        <p className="text-slate-500 text-xs">{candidato.email} · {candidato.tenant}</p>
        {!isApproved && candidato.rejNote && (
          <p className="text-red-600 text-xs mt-0.5 italic">"{candidato.rejNote}"</p>
        )}
      </div>
      <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
        isApproved ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
      }`}>
        {isApproved ? '✓ Aprovado' : '✕ Rejeitado'}
      </span>
    </div>
  )
}

// ─── Page Principal ───────────────────────────────────────────────────────────
export default function AprovacaoPromotoresPage() {
  const [candidatos, setCandidatos]   = useState<Candidato[]>(MOCK_CANDIDATOS)
  const [rejecting, setRejecting]     = useState<Candidato | null>(null)
  const [processados, setProcessados] = useState<Candidato[]>([])
  const [toast, setToast]             = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  function handleAprovar(id: string) {
    const cand = candidatos.find(c => c.id === id)
    if (!cand) return
    const updated = { ...cand, status: 'APPROVED' as ApprovalStatus }
    setCandidatos(prev => prev.filter(c => c.id !== id))
    setProcessados(prev => [updated, ...prev])
    // TODO: chamar webhook/API real
    showToast(`${cand.nome} aprovado! Acesso ao app liberado.`, 'success')
  }

  function handleRejeitar(candidato: Candidato) {
    setRejecting(candidato)
  }

  function confirmRejeicao(note: string) {
    if (!rejecting) return
    const updated = { ...rejecting, status: 'REJECTED' as ApprovalStatus, rejNote: note || 'Sem motivo informado' }
    setCandidatos(prev => prev.filter(c => c.id !== rejecting.id))
    setProcessados(prev => [updated, ...prev])
    setRejecting(null)
    showToast(`${rejecting.nome} rejeitado e removido da fila.`, 'error')
  }

  const pendingCount = candidatos.length

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/promotores"
              className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-slate-800">Fila de Aprovação</h1>
                {pendingCount > 0 && (
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-sm">Aprove ou rejeite novos promotores que solicitaram acesso ao app</p>
            </div>
          </div>
        </div>

        {/* Banner de regra */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <p className="text-blue-800 font-semibold text-sm">Controle de acesso mobile</p>
            <p className="text-blue-700 text-xs mt-0.5">
              Apenas promotores com status <strong>Aprovado</strong> conseguem autenticar no app Flutter.
              Candidatos <strong>Pendentes</strong> recebem erro 403 ao tentar fazer login.
              Gestores veem apenas candidatos da sua franquia.
            </p>
          </div>
        </div>

        {/* Fila pendente */}
        <div>
          <h2 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"/>
            Aguardando análise
            <span className="text-slate-400 font-normal text-sm">({pendingCount} candidato{pendingCount !== 1 ? 's' : ''})</span>
          </h2>

          {pendingCount === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-slate-700 font-semibold text-lg">Fila zerada!</p>
              <p className="text-slate-400 text-sm mt-1">Todos os candidatos foram processados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {candidatos.map(c => (
                <CardCandidato
                  key={c.id}
                  candidato={c}
                  onAprovar={handleAprovar}
                  onRejeitar={handleRejeitar}
                />
              ))}
            </div>
          )}
        </div>

        {/* Processados nesta sessão */}
        {processados.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400"/>
              Processados nesta sessão
              <span className="text-slate-400 font-normal text-sm">({processados.length})</span>
            </h2>
            <div className="space-y-3">
              {processados.map(c => <CardResultado key={c.id} candidato={c}/>)}
            </div>
          </div>
        )}
      </div>

      {/* Modal Rejeição */}
      {rejecting && (
        <ModalRejeicao
          candidato={rejecting}
          onConfirm={confirmRejeicao}
          onClose={() => setRejecting(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  )
}
