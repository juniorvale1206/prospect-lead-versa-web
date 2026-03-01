'use client'

import { useState, useRef } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type KycStatus  = 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'
type PixKeyType = 'CPF' | 'EMAIL' | 'TELEFONE' | 'CNPJ' | 'ALEATORIA'
type ActiveTab  = 'dados' | 'kyc' | 'pix'

interface PerfilData {
  id:          string
  nome:        string
  email:       string
  telefone:    string
  cpf:         string
  role:        string
  tenant:      string
  avatarUrl:   string | null
  fotoUrl:     string | null
  // KYC
  cpfPhotoUrl: string | null
  kycStatus:   KycStatus
  kycNote:     string | null
  // Pix
  pixKeyType:  PixKeyType | null
  pixKey:      string | null
  pixVerified: boolean
}

// ─── Mock (será substituído por dados reais da sessão) ───────────────────────
const MOCK_PERFIL: PerfilData = {
  id:          'p1',
  nome:        'Ana Silva',
  email:       'ana.silva@rastremix.com',
  telefone:    '(31) 98800-1111',
  cpf:         '123.456.789-01',
  role:        'Promotor de Rua',
  tenant:      'Rastremix',
  avatarUrl:   null,
  fotoUrl:     null,
  cpfPhotoUrl: null,
  kycStatus:   'PENDING_REVIEW',
  kycNote:     null,
  pixKeyType:  null,
  pixKey:      null,
  pixVerified: false,
}

// ─── Utils ───────────────────────────────────────────────────────────────────
const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  CPF:       'CPF',
  EMAIL:     'E-mail',
  TELEFONE:  'Telefone / WhatsApp',
  CNPJ:      'CNPJ',
  ALEATORIA: 'Chave Aleatória',
}

const PIX_TYPE_PLACEHOLDERS: Record<PixKeyType, string> = {
  CPF:       '000.000.000-00',
  EMAIL:     'seu@email.com',
  TELEFONE:  '+55 (11) 99999-0000',
  CNPJ:      '00.000.000/0001-00',
  ALEATORIA: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
}

const KYC_CONFIG: Record<KycStatus, { label: string; bg: string; text: string; border: string; icon: string }> = {
  PENDING_REVIEW: {
    label: 'Aguardando Revisão', bg: 'bg-amber-50',  text: 'text-amber-700',
    border: 'border-amber-200', icon: '⏳',
  },
  VERIFIED: {
    label: 'Documento Verificado', bg: 'bg-emerald-50', text: 'text-emerald-700',
    border: 'border-emerald-200', icon: '✓',
  },
  REJECTED: {
    label: 'Documento Rejeitado', bg: 'bg-red-50', text: 'text-red-700',
    border: 'border-red-200', icon: '✕',
  },
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl max-w-sm
      ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      <span className="text-lg">{type === 'success' ? '✓' : '✕'}</span>
      <p className="text-sm font-semibold flex-1">{msg}</p>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Avatar grande ───────────────────────────────────────────────────────────
function BigAvatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nome} className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-lg"/>
  }
  return (
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center border-4 border-white shadow-lg">
      <span className="text-white text-2xl font-black">{initials}</span>
    </div>
  )
}

// ─── Aba: Dados Pessoais ─────────────────────────────────────────────────────
function TabDados({ perfil }: { perfil: PerfilData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Nome completo', value: perfil.nome },
          { label: 'E-mail',        value: perfil.email },
          { label: 'Telefone',      value: perfil.telefone },
          { label: 'CPF',           value: perfil.cpf },
          { label: 'Função',        value: perfil.role },
          { label: 'Franquia',      value: perfil.tenant },
        ].map(f => (
          <div key={f.label} className="bg-slate-50 rounded-xl p-3.5">
            <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-1">{f.label}</p>
            <p className="text-slate-800 font-semibold text-sm">{f.value || '—'}</p>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p className="text-blue-700 text-xs">Para alterar nome, e-mail ou CPF, entre em contato com o seu gestor.</p>
      </div>
    </div>
  )
}

// ─── Aba: Documento KYC ──────────────────────────────────────────────────────
interface TabKycProps {
  perfil:   PerfilData
  onUpdate: (field: Partial<PerfilData>) => void
}

function TabKyc({ perfil, onUpdate }: TabKycProps) {
  const fileRef              = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(perfil.cpfPhotoUrl)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const kyc = KYC_CONFIG[perfil.kycStatus]

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDocFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSend() {
    if (!docFile) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('cpfPhoto', docFile)
      const res = await fetch('/api/mobile/perfil', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        onUpdate({ cpfPhotoUrl: data.perfil.cpfPhotoUrl, kycStatus: 'PENDING_REVIEW' })
        setToast({ msg: 'Documento enviado! Aguarde a validação pelo financeiro.', type: 'success' })
      } else {
        setToast({ msg: data.error || 'Erro ao enviar', type: 'error' })
      }
    } catch {
      setToast({ msg: 'Falha de conexão', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Status KYC atual */}
      <div className={`${kyc.bg} border ${kyc.border} rounded-2xl p-4 flex items-start gap-3`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 font-bold ${kyc.text} ${kyc.bg}`}>
          {kyc.icon}
        </div>
        <div>
          <p className={`font-bold text-sm ${kyc.text}`}>{kyc.label}</p>
          {perfil.kycNote && (
            <p className={`text-xs mt-1 ${kyc.text} opacity-80`}>
              Observação: {perfil.kycNote}
            </p>
          )}
          {perfil.kycStatus === 'PENDING_REVIEW' && !perfil.cpfPhotoUrl && (
            <p className={`text-xs mt-1 ${kyc.text} opacity-80`}>
              Envie a foto do seu documento (CPF ou RG) para validação.
            </p>
          )}
        </div>
      </div>

      {/* Área de upload */}
      <div>
        <p className="text-sm font-bold text-slate-700 mb-3">Foto do Documento (CPF ou RG)</p>
        <div className="space-y-3">
          {/* Preview */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative w-full aspect-[3/2] max-h-64 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
          >
            {preview ? (
              <>
                <img src={preview} alt="Documento" className="w-full h-full object-contain"/>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition bg-white/90 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                    Trocar foto
                  </span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-slate-600 text-sm font-semibold">Clique para enviar</p>
                  <p className="text-slate-400 text-xs mt-0.5">JPG, PNG, PDF — máx. 8 MB</p>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile}/>
          </div>

          {/* Instruções */}
          <div className="bg-slate-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-600">Dicas para aprovação rápida:</p>
            <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
              <li>Use foto clara, bem iluminada e sem reflexos</li>
              <li>Documento deve estar aberto (frente)</li>
              <li>CPF ou RG com foto são aceitos</li>
              <li>CNH digital também é válida</li>
            </ul>
          </div>

          {/* Botão enviar */}
          {docFile && (
            <button onClick={handleSend} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition shadow-sm shadow-emerald-200">
              {saving ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Enviando...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Enviar Documento para Validação</>
              )}
            </button>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  )
}

// ─── Aba: Dados Pix ──────────────────────────────────────────────────────────
interface TabPixProps {
  perfil:   PerfilData
  onUpdate: (field: Partial<PerfilData>) => void
}

function TabPix({ perfil, onUpdate }: TabPixProps) {
  const [pixKeyType, setPixKeyType] = useState<PixKeyType | ''>(perfil.pixKeyType ?? '')
  const [pixKey,     setPixKey]     = useState(perfil.pixKey ?? '')
  const [saving,     setSaving]     = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const hasPixData = !!perfil.pixKey && !!perfil.pixKeyType
  const isDirty    = pixKeyType !== (perfil.pixKeyType ?? '') || pixKey !== (perfil.pixKey ?? '')

  async function handleSave() {
    if (!pixKeyType) { setToast({ msg: 'Selecione o tipo da chave Pix', type: 'error' }); return }
    if (!pixKey.trim()) { setToast({ msg: 'Informe a chave Pix', type: 'error' }); return }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('pixKeyType', pixKeyType)
      fd.append('pixKey', pixKey.trim())
      const res  = await fetch('/api/mobile/perfil', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        onUpdate({ pixKeyType: data.perfil.pixKeyType, pixKey: data.perfil.pixKey })
        setToast({ msg: 'Chave Pix salva com sucesso!', type: 'success' })
      } else {
        setToast({ msg: data.error || 'Erro ao salvar', type: 'error' })
      }
    } catch {
      setToast({ msg: 'Falha de conexão', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(perfil.pixKey ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setToast({ msg: 'Não foi possível copiar automaticamente', type: 'error' })
    }
  }

  return (
    <div className="space-y-5">
      {/* Chave cadastrada atual */}
      {hasPixData && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                </svg>
              </div>
              <div>
                <p className="text-emerald-800 font-bold text-sm">Chave Pix cadastrada</p>
                <p className="text-emerald-600 text-xs mt-0.5">
                  {PIX_TYPE_LABELS[perfil.pixKeyType!]} · {perfil.pixKey}
                </p>
                {perfil.pixVerified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded-full mt-1">
                    ✓ Verificada pelo financeiro
                  </span>
                )}
              </div>
            </div>
            <button onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex-shrink-0
                ${copied ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100'}`}>
              {copied
                ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Copiada!</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>Copiar</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Formulário */}
      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-700">{hasPixData ? 'Atualizar chave Pix' : 'Cadastrar chave Pix'}</p>

        {/* Tipo */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Tipo da chave</label>
          <div className="grid grid-cols-3 gap-2">
            {(['CPF', 'EMAIL', 'TELEFONE', 'CNPJ', 'ALEATORIA'] as PixKeyType[]).map(t => (
              <button key={t} type="button"
                onClick={() => { setPixKeyType(t); setPixKey('') }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  pixKeyType === t
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                }`}>
                {PIX_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Chave */}
        {pixKeyType && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Chave Pix ({PIX_TYPE_LABELS[pixKeyType]})
            </label>
            <div className="relative">
              <input
                type="text"
                value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder={PIX_TYPE_PLACEHOLDERS[pixKeyType]}
                className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
              {pixKey && (
                <button onClick={() => setPixKey('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Alerta sem pix */}
        {!hasPixData && !pixKeyType && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p className="text-amber-800 font-semibold text-xs">Dados bancários pendentes</p>
              <p className="text-amber-700 text-xs mt-0.5">Sem a chave Pix cadastrada, o financeiro não poderá realizar o seu pagamento.</p>
            </div>
          </div>
        )}

        {/* Botão salvar */}
        {isDirty && pixKeyType && pixKey.trim() && (
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition shadow-sm shadow-emerald-200">
            {saving ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Salvando...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Salvar Chave Pix</>
            )}
          </button>
        )}
      </div>

      {/* Info segurança */}
      <div className="bg-slate-50 rounded-xl p-3.5 flex items-start gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p className="text-slate-500 text-xs">Seus dados bancários são criptografados e acessados apenas pelo setor financeiro para processamento dos pagamentos.</p>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function PerfilPromotorClient({ initialPerfil = MOCK_PERFIL }: { initialPerfil?: PerfilData }) {
  const [perfil,    setPerfil]    = useState<PerfilData>(initialPerfil)
  const [activeTab, setActiveTab] = useState<ActiveTab>('dados')

  function handleUpdate(updates: Partial<PerfilData>) {
    setPerfil(prev => ({ ...prev, ...updates }))
  }

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode; alert?: boolean }[] = [
    {
      key: 'dados',
      label: 'Dados Pessoais',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
    },
    {
      key: 'kyc',
      label: 'Documento (KYC)',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/></svg>,
      alert: perfil.kycStatus !== 'VERIFIED',
    },
    {
      key: 'pix',
      label: 'Dados de Pagamento (Pix)',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>,
      alert: !perfil.pixKey,
    },
  ]

  const kyc = KYC_CONFIG[perfil.kycStatus]

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Hero Card */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-emerald-500 to-emerald-700 relative">
            <div className="absolute inset-0 opacity-10">
              <svg viewBox="0 0 200 80" className="w-full h-full"><circle cx="180" cy="10" r="60" fill="white"/><circle cx="20" cy="70" r="40" fill="white"/></svg>
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-10 mb-4">
              <BigAvatar nome={perfil.nome} fotoUrl={perfil.fotoUrl}/>
              <div className="pb-1 flex-1 min-w-0">
                <h1 className="text-xl font-black text-slate-800 truncate">{perfil.nome}</h1>
                <p className="text-slate-500 text-sm">{perfil.role} · {perfil.tenant}</p>
              </div>
            </div>

            {/* Badges de status */}
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${kyc.bg} ${kyc.text} ${kyc.border}`}>
                <span>{kyc.icon}</span>
                KYC: {kyc.label}
              </span>
              {perfil.pixKey ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                  Pix: {PIX_TYPE_LABELS[perfil.pixKeyType!]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  ⚠ Pix não cadastrado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3.5 text-xs font-semibold transition-all relative
                  ${activeTab === tab.key ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <span className={activeTab === tab.key ? 'text-emerald-600' : 'text-slate-400'}>{tab.icon}</span>
                <span className="hidden sm:block">{tab.label}</span>
                {tab.alert && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"/>
                )}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"/>
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'dados' && <TabDados perfil={perfil}/>}
            {activeTab === 'kyc'   && <TabKyc perfil={perfil} onUpdate={handleUpdate}/>}
            {activeTab === 'pix'   && <TabPix perfil={perfil} onUpdate={handleUpdate}/>}
          </div>
        </div>
      </div>
    </div>
  )
}
