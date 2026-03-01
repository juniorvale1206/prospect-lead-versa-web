'use client'

import { useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type KycStatus  = 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'
type PixKeyType = 'CPF' | 'EMAIL' | 'TELEFONE' | 'CNPJ' | 'ALEATORIA'

interface KycEntry {
  id:          string
  nome:        string
  email:       string
  cpf:         string
  telefone:    string
  tenant:      string
  role:        string
  avatarUrl:   string | null
  cpfPhotoUrl: string | null
  kycStatus:   KycStatus
  kycNote:     string | null
  pixKeyType:  PixKeyType | null
  pixKey:      string | null
  pixVerified: boolean
  createdAt:   string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_KYC: KycEntry[] = [
  {
    id: 'u1', nome: 'Ana Silva', email: 'ana.silva@rastremix.com',
    cpf: '123.456.789-01', telefone: '(31) 98800-1111',
    tenant: 'Rastremix', role: 'Promotor de Rua', avatarUrl: null,
    cpfPhotoUrl: null, kycStatus: 'PENDING_REVIEW', kycNote: null,
    pixKeyType: 'CPF', pixKey: '123.456.789-01', pixVerified: false,
    createdAt: '2025-02-01',
  },
  {
    id: 'u2', nome: 'João Costa', email: 'joao.costa@rastremix.com',
    cpf: '234.567.890-12', telefone: '(31) 97711-2222',
    tenant: 'Rastremix', role: 'Promotor de Rua', avatarUrl: null,
    cpfPhotoUrl: '/uploads/documents/mock_doc_joao.jpg',
    kycStatus: 'PENDING_REVIEW', kycNote: null,
    pixKeyType: 'EMAIL', pixKey: 'joao.costa@rastremix.com', pixVerified: false,
    createdAt: '2025-02-03',
  },
  {
    id: 'u3', nome: 'Mariana Ramos', email: 'mariana@valeteck.com',
    cpf: '345.678.901-23', telefone: '(11) 96622-3333',
    tenant: 'Valeteck', role: 'Promotor de Rua', avatarUrl: null,
    cpfPhotoUrl: '/uploads/documents/mock_doc_mariana.jpg',
    kycStatus: 'VERIFIED', kycNote: null,
    pixKeyType: 'TELEFONE', pixKey: '+55 (11) 96622-3333', pixVerified: true,
    createdAt: '2025-01-15',
  },
  {
    id: 'u4', nome: 'Lucas Ferreira', email: 'lucas@valeteck.com',
    cpf: '456.789.012-34', telefone: '(11) 95533-4444',
    tenant: 'Valeteck', role: 'Promotor de Rua', avatarUrl: null,
    cpfPhotoUrl: null, kycStatus: 'PENDING_REVIEW', kycNote: null,
    pixKeyType: null, pixKey: null, pixVerified: false,
    createdAt: '2025-02-10',
  },
  {
    id: 'u5', nome: 'Beatriz Promotora', email: 'beatriz@valeteck.com',
    cpf: '567.890.123-45', telefone: '(11) 97700-5678',
    tenant: 'Valeteck', role: 'Funcionário PDV', avatarUrl: null,
    cpfPhotoUrl: '/uploads/documents/mock_doc_beatriz.jpg',
    kycStatus: 'REJECTED', kycNote: 'Documento ilegível. Envie uma foto mais clara.',
    pixKeyType: 'TELEFONE', pixKey: '+55 (11) 97700-5678', pixVerified: true,
    createdAt: '2025-01-28',
  },
]

// ─── Constantes ───────────────────────────────────────────────────────────────
const PIX_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF', EMAIL: 'E-mail', TELEFONE: 'Telefone', CNPJ: 'CNPJ', ALEATORIA: 'Chave Aleatória',
}

const KYC_CFG: Record<KycStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  PENDING_REVIEW: { label: 'Aguardando Revisão', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400'  },
  VERIFIED:       { label: 'Verificado',         bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  REJECTED:       { label: 'Rejeitado',           bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',    dot: 'bg-red-500'     },
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl max-w-sm
      ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
      <span className="text-lg">{type === 'success' ? '✓' : '✕'}</span>
      <p className="text-sm font-semibold flex-1">{msg}</p>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 ml-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

// ─── KYC Status Badge ─────────────────────────────────────────────────────────
function KycBadge({ status }: { status: KycStatus }) {
  const c = KYC_CFG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>
      {c.label}
    </span>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const COLORS = ['from-violet-400 to-violet-600','from-blue-400 to-blue-600','from-emerald-400 to-emerald-600',
                 'from-rose-400 to-rose-600','from-amber-400 to-amber-600','from-cyan-400 to-cyan-600']

function Av({ nome, idx }: { nome: string; idx: number }) {
  const initials = nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()
  return (
    <div className={`w-10 h-10 bg-gradient-to-br ${COLORS[idx % COLORS.length]} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white text-xs font-black">{initials}</span>
    </div>
  )
}

// ─── Modal de Revisão KYC ─────────────────────────────────────────────────────
function ModalKycReview({
  entry,
  onClose,
  onSave,
}: {
  entry:   KycEntry
  onClose: () => void
  onSave:  (id: string, kycStatus: KycStatus, kycNote: string, pixVerified: boolean) => void
}) {
  const [kycStatus,   setKycStatus]   = useState<KycStatus>(entry.kycStatus)
  const [kycNote,     setKycNote]     = useState(entry.kycNote ?? '')
  const [pixVerified, setPixVerified] = useState(entry.pixVerified)
  const [saving,      setSaving]      = useState(false)
  const [imgExpanded, setImgExpanded] = useState(false)

  const hasPix = !!entry.pixKey && !!entry.pixKeyType
  const cfg    = KYC_CFG[kycStatus]

  async function handleSave() {
    setSaving(true)
    try {
      // In a real scenario, would call the API. Using mock here.
      await new Promise(r => setTimeout(r, 600))
      onSave(entry.id, kycStatus, kycNote, pixVerified)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget && !imgExpanded) onClose() }}
    >
      {/* Imagem expandida */}
      {imgExpanded && entry.cpfPhotoUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-8 bg-black/80"
          onClick={() => setImgExpanded(false)}>
          <img src={entry.cpfPhotoUrl} alt="Documento" className="max-w-full max-h-full rounded-2xl shadow-2xl"/>
          <button className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
            onClick={() => setImgExpanded(false)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 sticky top-0 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Av nome={entry.nome} idx={0}/>
              <div>
                <p className="text-white font-bold leading-tight">{entry.nome}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-slate-300 text-xs">{entry.role}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-500"/>
                  <span className="text-slate-300 text-xs">{entry.tenant}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ─ Dados pessoais ─ */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dados do Promotor</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'CPF',      value: entry.cpf || '—' },
                { label: 'Telefone', value: entry.telefone || '—' },
                { label: 'E-mail',   value: entry.email },
                { label: 'Cadastro', value: entry.createdAt },
              ].map(f => (
                <div key={f.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">{f.label}</p>
                  <p className="text-slate-700 font-semibold text-sm truncate">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Documento / Foto ─ */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Documento Enviado</p>
            {entry.cpfPhotoUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer group"
                onClick={() => setImgExpanded(true)}>
                <img src={entry.cpfPhotoUrl} alt="Documento" className="w-full max-h-48 object-contain"/>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition bg-white/90 text-slate-800 text-xs font-bold px-4 py-2 rounded-full shadow">
                    🔍 Ver em tela cheia
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                </svg>
                <div>
                  <p className="text-slate-500 font-semibold text-sm">Nenhum documento enviado</p>
                  <p className="text-slate-400 text-xs mt-0.5">O promotor ainda não fez o upload do documento.</p>
                </div>
              </div>
            )}
          </div>

          {/* ─ Decisão KYC ─ */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Decisão de Validação</p>
            <div className="flex gap-2.5 mb-4">
              {(['PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as KycStatus[]).map(s => {
                const c = KYC_CFG[s]
                return (
                  <button key={s} onClick={() => setKycStatus(s)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-bold
                      ${kycStatus === s
                        ? `${c.bg} ${c.border} ${c.text} shadow-sm`
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                    {s === 'VERIFIED' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                    {s === 'REJECTED' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                    {s === 'PENDING_REVIEW' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                    <span className="text-center leading-tight">{KYC_CFG[s].label}</span>
                  </button>
                )
              })}
            </div>

            {/* Nota de rejeição */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Observação {kycStatus === 'REJECTED' ? '(obrigatória para rejeição)' : '(opcional)'}
              </label>
              <textarea
                value={kycNote}
                onChange={e => setKycNote(e.target.value)}
                placeholder={kycStatus === 'REJECTED'
                  ? 'Ex: Documento ilegível. Envie uma foto mais nítida com boa iluminação.'
                  : 'Observação interna sobre a validação...'
                }
                rows={3}
                className={`w-full px-4 py-3 rounded-xl border text-sm resize-none focus:outline-none focus:ring-2
                  ${kycStatus === 'REJECTED' && !kycNote.trim()
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/50'
                    : 'border-slate-200 focus:ring-emerald-200'
                  }`}
              />
            </div>
          </div>

          {/* ─ Validação do Pix ─ */}
          {hasPix && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Chave Pix</p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-xs font-semibold uppercase">{PIX_LABELS[entry.pixKeyType!]}</p>
                    <p className="font-mono text-slate-800 font-bold text-sm mt-0.5">{entry.pixKey}</p>
                  </div>
                  {entry.pixVerified && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                      ✓ Verificada
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-12 h-6 rounded-full transition-colors ${pixVerified ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    onClick={() => setPixVerified(!pixVerified)}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${pixVerified ? 'left-7' : 'left-1'}`}/>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${pixVerified ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {pixVerified ? 'Chave Pix verificada ✓' : 'Marcar como verificada'}
                    </p>
                    <p className="text-slate-400 text-xs">Confirma que a chave Pix pertence ao promotor</p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 sticky bottom-0 bg-white pt-4 border-t border-slate-100">
          <button onClick={onClose}
            className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (kycStatus === 'REJECTED' && !kycNote.trim())}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed
              bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200">
            {saving ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Salvando...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Salvar Decisão</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function KycReviewClient() {
  const [entries, setEntries]     = useState<KycEntry[]>(MOCK_KYC)
  const [selected, setSelected]   = useState<KycEntry | null>(null)
  const [filterKyc, setFilterKyc] = useState<'ALL' | KycStatus>('ALL')
  const [search, setSearch]       = useState('')
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const pending = entries.filter(e => e.kycStatus === 'PENDING_REVIEW').length

  const filtered = entries.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = e.nome.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || (e.cpf ?? '').includes(q)
    const matchFilter = filterKyc === 'ALL' || e.kycStatus === filterKyc
    return matchSearch && matchFilter
  })

  function handleSave(id: string, kycStatus: KycStatus, kycNote: string, pixVerified: boolean) {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, kycStatus, kycNote: kycNote || null, pixVerified } : e
    ))
    setSelected(null)
    const verb = kycStatus === 'VERIFIED' ? 'aprovado' : kycStatus === 'REJECTED' ? 'rejeitado' : 'atualizado'
    setToast({ msg: `KYC ${verb} com sucesso!`, type: 'success' })
    setTimeout(() => setToast(null), 4000)
  }

  const stats = {
    total:    entries.length,
    pending:  entries.filter(e => e.kycStatus === 'PENDING_REVIEW').length,
    verified: entries.filter(e => e.kycStatus === 'VERIFIED').length,
    rejected: entries.filter(e => e.kycStatus === 'REJECTED').length,
    semPix:   entries.filter(e => !e.pixKey).length,
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Revisão KYC</h1>
              <p className="text-slate-500 text-sm">Validação de documentos e dados bancários</p>
            </div>
            {pending > 0 && (
              <span className="flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-black px-3 py-1.5 rounded-full border border-red-200 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
                {pending} pendente{pending > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, bg: 'bg-white', text: 'text-slate-800', sub: 'text-slate-400', border: 'border-slate-200' },
            { label: 'Pendentes', value: stats.pending, bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-400', border: 'border-amber-200' },
            { label: 'Verificados', value: stats.verified, bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-emerald-400', border: 'border-emerald-200' },
            { label: 'Rejeitados', value: stats.rejected, bg: 'bg-red-50', text: 'text-red-700', sub: 'text-red-400', border: 'border-red-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 shadow-sm`}>
              <p className={`${s.sub} text-xs font-semibold uppercase tracking-wider mb-1`}>{s.label}</p>
              <p className={`${s.text} font-black text-3xl`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Alerta sem pix */}
        {stats.semPix > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p className="text-amber-700 text-xs font-semibold">
              <strong>{stats.semPix}</strong> promotor{stats.semPix > 1 ? 'es' : ''} sem dados Pix cadastrados — pagamentos bloqueados.
            </p>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail ou CPF..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div className="flex gap-2">
              {(['ALL', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const).map(f => {
                const labels: Record<string, string> = {
                  ALL: 'Todos', PENDING_REVIEW: 'Pendentes', VERIFIED: 'Verificados', REJECTED: 'Rejeitados',
                }
                return (
                  <button key={f} onClick={() => setFilterKyc(f)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                      filterKyc === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}>
                    {labels[f]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 pr-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Promotor</th>
                  <th className="text-left py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">CPF</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">KYC</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Pix</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Doc</th>
                  <th className="text-center py-3 pl-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">Nenhum registro encontrado.</td></tr>
                )}
                {filtered.map((e, i) => {
                  const hasPix = !!e.pixKey
                  return (
                    <tr key={e.id}
                      className={`hover:bg-slate-50/80 transition-colors ${e.kycStatus === 'PENDING_REVIEW' ? 'bg-amber-50/30' : ''}`}>
                      <td className="py-3.5 pr-3">
                        <div className="flex items-center gap-3">
                          <Av nome={e.nome} idx={i}/>
                          <div className="min-w-0">
                            <p className="text-slate-800 font-semibold text-sm truncate">{e.nome}</p>
                            <p className="text-slate-400 text-xs truncate">{e.email}</p>
                            <p className="text-slate-400 text-[10px]">{e.tenant}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 hidden sm:table-cell">
                        <span className="font-mono text-slate-600 text-xs">{e.cpf || '—'}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <KycBadge status={e.kycStatus}/>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {hasPix ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border
                            ${e.pixVerified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                            {e.pixVerified ? '✓ Verificado' : PIX_LABELS[e.pixKeyType!]}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-200">
                            Sem Pix
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {e.cpfPhotoUrl ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full border border-slate-200">
                            📎 Enviado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-full border border-slate-200">
                            Sem doc
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 pl-3 text-center">
                        <button onClick={() => setSelected(e)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                            ${e.kycStatus === 'PENDING_REVIEW'
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}>
                          {e.kycStatus === 'PENDING_REVIEW' ? '→ Revisar' : 'Editar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <p className="text-slate-400 text-xs text-right">{filtered.length} registro(s)</p>
          )}
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <ModalKycReview
          entry={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  )
}
