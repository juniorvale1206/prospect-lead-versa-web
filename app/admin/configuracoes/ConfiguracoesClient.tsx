'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings, MessageSquare, DollarSign, Satellite,
  Eye, EyeOff, Copy, CheckCheck, Save, Zap, Loader2,
  Building2, AlertTriangle, CheckCircle2, XCircle,
  Info, ExternalLink, RefreshCw, Shield, Globe, Phone, User,
  Mail, MapPin, Palette, ChevronRight, Wifi, WifiOff
} from 'lucide-react'

/* ──────────────────────────────────────────── Types */
interface Integration {
  id?: string
  provider: string
  apiKey?: string
  apiSecret?: string
  apiKeyAux?: string
  webhookUrl?: string
  environment?: string
  metadata?: string
  isActive?: boolean | number
  lastTestedAt?: string
  lastTestOk?: boolean | number
  lastTestMsg?: string
}

interface TenantProfile {
  nome?: string
  document?: string
  logoUrl?: string
  primaryColor?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  city?: string
  state?: string
  plan?: string
}

interface Props {
  tenantId: string
  role: string
  userName: string
}

/* ──────────────────────────────────────────── Tab Config */
const TABS = [
  { id: 'perfil',    label: 'Perfil da Empresa',   icon: Building2,    desc: 'Dados cadastrais e identidade visual' },
  { id: 'whatsapp',  label: 'WhatsApp Oficial',     icon: MessageSquare,desc: 'Meta Cloud API · Webhooks' },
  { id: 'asaas',     label: 'Financeiro (Asaas)',   icon: DollarSign,   desc: 'Pagamentos e cobranças' },
  { id: 'smartgps',  label: 'Plataforma (SmartGPS)',icon: Satellite,    desc: 'Telemetria e rastreamento' },
] as const
type TabId = typeof TABS[number]['id']

/* ──────────────────────────────────────────── Helpers */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }
  return { copied, copy }
}

const PRESET_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#f97316','#14b8a6','#ef4444','#64748b']

/* ──────────────────────────────────────────── Secret Input */
function SecretInput({
  label, value, onChange, placeholder, helpText, required = false, disabled = false,
  id, prefix
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; helpText?: string; required?: boolean; disabled?: boolean
  id: string; prefix?: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative flex items-center">
        {prefix && <div className="absolute left-3 text-slate-400">{prefix}</div>}
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || (show ? 'Cole a chave aqui...' : '••••••••••••••••')}
          disabled={disabled}
          autoComplete="off"
          className={`w-full ${prefix ? 'pl-9' : 'pl-3'} pr-10 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 bg-white transition-colors`}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors">
          {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
        </button>
      </div>
      {helpText && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{helpText}</p>}
    </div>
  )
}

/* ──────────────────────────────────────────── Read-only copyable field */
function ReadOnlyField({
  label, value, copy, copied, copyKey, icon, mono = true
}: {
  label: string; value: string; copy: (v: string, k: string) => void
  copied: string | null; copyKey: string; icon?: React.ReactNode; mono?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
        {icon} {label}
        <span className="text-xs font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Somente leitura</span>
      </label>
      <div className="flex items-center gap-2">
        <div className={`flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 ${mono ? 'font-mono' : ''} break-all`}>
          {value}
        </div>
        <button onClick={() => copy(value, copyKey)}
          className="p-2.5 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-300 text-slate-500 hover:text-indigo-600 transition-all flex-shrink-0"
          title="Copiar">
          {copied === copyKey ? <CheckCheck className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4"/>}
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────── Test Result Banner */
function TestBanner({ result }: { result: { ok: boolean; message: string; latencyMs?: number } | null }) {
  if (!result) return null
  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl text-sm ${result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
      {result.ok
        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600"/>
        : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500"/>}
      <div>
        <span className="font-semibold">{result.message}</span>
        {result.latencyMs && (
          <span className="ml-2 text-xs opacity-70">({result.latencyMs}ms)</span>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function ConfiguracoesClient({ tenantId, role }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('perfil')
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
  const [profile, setProfile] = useState<TenantProfile>({})
  const [loadingData, setLoadingData] = useState(true)
  const { copied, copy } = useCopy()

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; type: 'success'|'error'|'info' } | null>(null)
  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      // Carregar integrações
      const res = await fetch(`/api/admin/integrations?tenantId=${tenantId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const map: Record<string, Integration> = {}
        for (const i of (data.integrations || [])) {
          map[i.provider] = i
        }
        setIntegrations(map)
      }

      // Carregar perfil do tenant
      const resT = await fetch(`/api/admin/tenants?tenantId=${tenantId}`, { credentials: 'include' })
      if (resT.ok) {
        const td = await resT.json()
        const t = td.tenants?.[0] || {}
        setProfile({
          nome: t.nome || '', document: t.document || '', logoUrl: t.logoUrl || '',
          primaryColor: t.primaryColor || '#10b981', contactName: t.contactName || '',
          contactEmail: t.contactEmail || '', contactPhone: t.contactPhone || '',
          city: t.city || '', state: t.state || '', plan: t.plan || 'STANDARD',
        })
      }
    } catch { /* usa dados vazios */ } finally { setLoadingData(false) }
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  /* ── Get integration for current provider ── */
  const getIntg = (provider: string): Integration =>
    integrations[provider] || { provider, apiKey: '', apiSecret: '', apiKeyAux: '', environment: 'PRODUCTION' }

  /* ── Save integration ── */
  const saveIntegration = async (provider: string, data: Partial<Integration>) => {
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, tenantId, ...data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar')

      setIntegrations(prev => ({ ...prev, [provider]: json.integration }))
      showToast(`✅ ${TABS.find(t=>t.id === activeTab)?.label} salvo com sucesso!`)
    } catch (err) {
      showToast(`❌ ${(err as Error).message}`, 'error')
    }
  }

  /* ── Test connection ── */
  const testConnection = async (provider: string, data: Partial<Integration>): Promise<{ok:boolean;message:string;latencyMs?:number}> => {
    const res = await fetch('/api/admin/integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, ...data }),
    })
    return res.json()
  }

  /* ──────────────────────────────────────────────── render */
  return (
    <div className="max-w-6xl mx-auto -m-6 p-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] flex items-center gap-2.5 px-5 py-3.5 rounded-2xl shadow-xl text-white text-sm font-semibold transition-all max-w-sm ${
          toast.type === 'success' ? 'bg-emerald-500' :
          toast.type === 'error'   ? 'bg-red-500' : 'bg-indigo-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0"/> :
           toast.type === 'error'   ? <XCircle className="w-4 h-4 flex-shrink-0"/> :
           <Info className="w-4 h-4 flex-shrink-0"/>}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center shadow-md">
              <Settings className="w-5 h-5 text-white"/>
            </div>
            Configurações & Integrações
          </h1>
          <p className="text-slate-400 text-sm mt-1 ml-11">Gerencie integrações e dados da sua franquia</p>
        </div>
        <button onClick={loadData} title="Recarregar"
          className="p-2.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`}/>
        </button>
      </div>

      {/* ── Layout: sidebar tabs + content ── */}
      <div className="flex gap-5">

        {/* ── Sidebar Tabs ── */}
        <div className="w-60 flex-shrink-0 space-y-1.5">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const hasIntg = tab.id !== 'perfil' && integrations[tab.id.toUpperCase() === 'WHATSAPP' ? 'WHATSAPP_META' : tab.id === 'asaas' ? 'ASAAS' : 'SMART_GPS']
            const providerKey = tab.id === 'whatsapp' ? 'WHATSAPP_META' : tab.id === 'asaas' ? 'ASAAS' : tab.id === 'smartgps' ? 'SMART_GPS' : ''
            const intg = providerKey ? integrations[providerKey] : null
            const testOk = intg?.lastTestOk === 1 || intg?.lastTestOk === true

            return (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? 'bg-indigo-600 shadow-md shadow-indigo-200 text-white'
                    : 'bg-white border border-slate-100 text-slate-600 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50/50'
                }`}>
                <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${isActive ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-indigo-100'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-600'}`}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold leading-tight ${isActive ? 'text-white' : ''}`}>{tab.label}</div>
                  <div className={`text-xs mt-0.5 leading-tight truncate ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>{tab.desc}</div>
                </div>
                <div className="flex-shrink-0 self-center">
                  {providerKey && intg && (
                    <span className={`w-2 h-2 rounded-full inline-block ${testOk ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      title={testOk ? 'Conexão testada OK' : 'Configure ou teste a conexão'}/>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-indigo-200 ml-1"/>}
                </div>
              </button>
            )
          })}

          {/* Dica de segurança */}
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-semibold mb-1.5">
              <Shield className="w-3.5 h-3.5"/>
              Segurança
            </div>
            <p className="text-xs text-amber-600 leading-relaxed">
              Chaves de API são armazenadas criptografadas e nunca expostas em logs ou respostas HTTP.
            </p>
          </div>
        </div>

        {/* ── Conteúdo das abas ── */}
        <div className="flex-1 min-w-0">
          {loadingData ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 text-indigo-400 animate-spin"/>
            </div>
          ) : (
            <>
              {activeTab === 'perfil' && (
                <PerfilTab profile={profile} setProfile={setProfile} tenantId={tenantId} showToast={showToast} copied={copied} copy={copy}/>
              )}
              {activeTab === 'whatsapp' && (
                <WhatsappTab
                  integration={getIntg('WHATSAPP_META')}
                  tenantId={tenantId}
                  onSave={(d) => saveIntegration('WHATSAPP_META', d)}
                  onTest={(d) => testConnection('WHATSAPP_META', d)}
                  copied={copied} copy={copy}
                />
              )}
              {activeTab === 'asaas' && (
                <AsaasTab
                  integration={getIntg('ASAAS')}
                  tenantId={tenantId}
                  onSave={(d) => saveIntegration('ASAAS', d)}
                  onTest={(d) => testConnection('ASAAS', d)}
                  copied={copied} copy={copy}
                />
              )}
              {activeTab === 'smartgps' && (
                <SmartGpsTab
                  integration={getIntg('SMART_GPS')}
                  tenantId={tenantId}
                  onSave={(d) => saveIntegration('SMART_GPS', d)}
                  onTest={(d) => testConnection('SMART_GPS', d)}
                  copied={copied} copy={copy}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ABA: PERFIL DA EMPRESA
══════════════════════════════════════════════════════════════ */
function PerfilTab({ profile, setProfile, tenantId, showToast, copied, copy }: {
  profile: TenantProfile
  setProfile: (p: TenantProfile) => void
  tenantId: string
  showToast: (m: string, t?: 'success'|'error'|'info') => void
  copied: string | null
  copy: (v: string, k: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const f = profile
  const set = (key: keyof TenantProfile, val: string) => setProfile({ ...f, [key]: val })

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants?tenantId=${tenantId}`, {
        method: 'GET', credentials: 'include'
      })
      const data = await res.json()
      const id = data.tenants?.[0]?.id
      if (!id) { showToast('Tenant não encontrado', 'error'); return }

      const r = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(f),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
      showToast('✅ Perfil da empresa salvo com sucesso!')
    } catch (err) {
      showToast(`❌ ${(err as Error).message}`, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-slate-600"/>
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Perfil da Empresa</h2>
          <p className="text-xs text-slate-400">Dados cadastrais e identidade visual da franquia</p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Identidade */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5"/> Identidade da Marca
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome da Franquia <span className="text-red-400">*</span></label>
              <input value={f.nome || ''} onChange={e => set('nome', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">CNPJ</label>
              <input value={f.document || ''} onChange={e => set('document', e.target.value)}
                placeholder="00.000.000/0000-00" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
          </div>

          {/* Cor principal */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5"/> Cor Principal (White-Label)
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => set('primaryColor', c)}
                  className={`w-8 h-8 rounded-lg transition-all hover:scale-110 ${f.primaryColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`}
                  style={{ background: c }}/>
              ))}
              <input type="color" value={f.primaryColor || '#10b981'} onChange={e => set('primaryColor', e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 p-0.5"/>
              <input value={f.primaryColor || ''} onChange={e => set('primaryColor', e.target.value)}
                placeholder="#10b981" maxLength={7}
                className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow"
                style={{ background: f.primaryColor || '#10b981' }}>
                {(f.nome || 'AB').charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          {/* Logo URL */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5"/> URL da Logo
            </label>
            <input value={f.logoUrl || ''} onChange={e => set('logoUrl', e.target.value)}
              placeholder="https://sua-empresa.com/logo.png"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
        </section>

        <hr className="border-slate-100"/>

        {/* Contato */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5"/> Dados de Contato
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><User className="w-3 h-3"/> Responsável</label>
              <input value={f.contactName || ''} onChange={e => set('contactName', e.target.value)}
                placeholder="Carlos Eduardo"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Phone className="w-3 h-3"/> Telefone</label>
              <input value={f.contactPhone || ''} onChange={e => set('contactPhone', e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Mail className="w-3 h-3"/> E-mail</label>
              <input type="email" value={f.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)}
                placeholder="contato@suaempresa.com.br"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3"/> Cidade</label>
              <input value={f.city || ''} onChange={e => set('city', e.target.value)}
                placeholder="São Paulo"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
              <select value={f.state || ''} onChange={e => set('state', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Selecione</option>
                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Tenant ID info */}
        <div className="bg-slate-50 rounded-xl p-4">
          <ReadOnlyField label="ID do Tenant" value={tenantId} copy={copy} copied={copied} copyKey="tenantId"
            icon={<Shield className="w-3.5 h-3.5"/>} mono/>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200">
          {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
          {saving ? 'Salvando...' : 'Salvar Perfil'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ABA: WHATSAPP OFICIAL (META)
══════════════════════════════════════════════════════════════ */
function WhatsappTab({ integration, tenantId, onSave, onTest, copied, copy }: {
  integration: Integration; tenantId: string
  onSave: (d: Partial<Integration>) => Promise<void>
  onTest: (d: Partial<Integration>) => Promise<{ok:boolean;message:string;latencyMs?:number}>
  copied: string | null; copy: (v: string, k: string) => void
}) {
  const [accessToken, setAccessToken]   = useState(integration.apiKey || '')
  const [phoneNumberId, setPhoneId]     = useState(integration.apiKeyAux || '')
  const [wabaId, setWabaId]             = useState(integration.apiSecret || '')
  const [saving, setSaving]             = useState(false)
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<{ok:boolean;message:string;latencyMs?:number}|null>(null)

  const webhookUrl   = integration.webhookUrl || `https://api.prospeclead.com/api/webhooks/whatsapp?tenant=${tenantId}`
  const verifyToken  = `prospeclead_${tenantId.slice(-8)}`

  const handleSave = async () => {
    setSaving(true)
    await onSave({ apiKey: accessToken, apiKeyAux: phoneNumberId, apiSecret: wabaId })
    setSaving(false)
  }

  const handleTest = async () => {
    if (!accessToken) { setTestResult({ ok: false, message: '⚠️ Informe o Access Token antes de testar.' }); return }
    setTesting(true); setTestResult(null)
    const r = await onTest({ apiKey: accessToken, apiKeyAux: phoneNumberId })
    setTestResult(r); setTesting(false)
  }

  const lastOk = integration.lastTestOk === 1 || integration.lastTestOk === true

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-green-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600"/>
          </div>
          <div>
            <h2 className="font-bold text-slate-800">WhatsApp Oficial (Meta)</h2>
            <p className="text-xs text-slate-400">WhatsApp Business Cloud API · Webhooks Meta</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${lastOk ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {lastOk ? <Wifi className="w-3.5 h-3.5"/> : <WifiOff className="w-3.5 h-3.5"/>}
          {lastOk ? 'Conectado' : 'Não testado'}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Guia de setup */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Como configurar:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
              <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium">Meta for Developers</a> → Seu App → WhatsApp</li>
              <li>Copie o <strong>Phone Number ID</strong> e o <strong>WhatsApp Business Account ID</strong></li>
              <li>Gere um <strong>Access Token</strong> permanente (System User)</li>
              <li>Cole a URL do Webhook abaixo no painel da Meta e o Token de Verificação</li>
            </ol>
          </div>
        </div>

        {/* Credenciais */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Credenciais de Acesso</h3>
          <div className="space-y-4">
            <SecretInput
              id="wa-phone-id"
              label="Phone Number ID"
              value={phoneNumberId} onChange={setPhoneId}
              placeholder="Ex: 123456789012345"
              helpText="Encontrado em: App → WhatsApp → API Setup → Phone Number ID"
              prefix={<Phone className="w-3.5 h-3.5"/>}
            />
            <SecretInput
              id="wa-waba-id"
              label="WhatsApp Business Account ID (WABA)"
              value={wabaId} onChange={setWabaId}
              placeholder="Ex: 987654321098765"
              helpText="Encontrado em: App → WhatsApp → API Setup → WhatsApp Business Account ID"
              prefix={<Building2 className="w-3.5 h-3.5"/>}
            />
            <SecretInput
              id="wa-token"
              label="Access Token (Permanente)"
              value={accessToken} onChange={setAccessToken}
              placeholder="EAAxxxxxxxx..."
              helpText="Use um token de System User permanente. Tokens de usuário expiram em 60 dias."
              required
            />
          </div>
        </section>

        <hr className="border-slate-100"/>

        {/* Webhook config (read-only) */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5"/> Configuração do Webhook (cole no painel Meta)
          </h3>
          <div className="space-y-3">
            <ReadOnlyField
              label="URL do Webhook" value={webhookUrl}
              copy={copy} copied={copied} copyKey="wa-webhook"
              icon={<Globe className="w-3.5 h-3.5"/>}
            />
            <ReadOnlyField
              label="Token de Verificação" value={verifyToken}
              copy={copy} copied={copied} copyKey="wa-verify"
              icon={<Shield className="w-3.5 h-3.5"/>}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3 bg-slate-50 rounded-lg p-3 leading-relaxed">
            <strong>Campos de assinatura no Webhook Meta:</strong> messages, message_deliveries, message_reads, messaging_referrals
          </p>
        </section>

        <TestBanner result={testResult}/>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
          {testing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> : <Zap className="w-4 h-4 text-amber-500"/>}
          {testing ? 'Testando...' : 'Testar Conexão'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-green-200">
          {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
          {saving ? 'Salvando...' : 'Salvar WhatsApp'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ABA: FINANCEIRO (ASAAS)
══════════════════════════════════════════════════════════════ */
function AsaasTab({ integration, tenantId, onSave, onTest, copied, copy }: {
  integration: Integration; tenantId: string
  onSave: (d: Partial<Integration>) => Promise<void>
  onTest: (d: Partial<Integration>) => Promise<{ok:boolean;message:string;latencyMs?:number}>
  copied: string | null; copy: (v: string, k: string) => void
}) {
  const [apiKey, setApiKey]         = useState(integration.apiKey || '')
  const [environment, setEnv]       = useState(integration.environment || 'SANDBOX')
  const [saving, setSaving]         = useState(false)
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState<{ok:boolean;message:string;latencyMs?:number}|null>(null)

  const webhookUrl = integration.webhookUrl || `https://api.prospeclead.com/api/webhooks/asaas?tenant=${tenantId}`
  const lastOk = integration.lastTestOk === 1 || integration.lastTestOk === true

  const handleSave = async () => {
    setSaving(true)
    await onSave({ apiKey, environment })
    setSaving(false)
  }

  const handleTest = async () => {
    if (!apiKey) { setTestResult({ ok: false, message: '⚠️ Informe a API Key antes de testar.' }); return }
    setTesting(true); setTestResult(null)
    const r = await onTest({ apiKey, environment })
    setTestResult(r); setTesting(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-600"/>
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Financeiro — Asaas</h2>
            <p className="text-xs text-slate-400">Gestão de cobranças, boletos e PIX</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${lastOk ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {lastOk ? <Wifi className="w-3.5 h-3.5"/> : <WifiOff className="w-3.5 h-3.5"/>}
          {lastOk ? 'Conectado' : 'Não testado'}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-emerald-700 space-y-0.5">
            <p className="font-semibold">Como obter sua API Key:</p>
            <p>Acesse <a href="https://www.asaas.com" target="_blank" rel="noreferrer" className="underline font-medium">Asaas.com</a> → Configurações → Integrações → Chave API</p>
            <p className="text-emerald-600">Use <strong>Sandbox</strong> para testes e <strong>Produção</strong> para cobranças reais.</p>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Credenciais</h3>
          <div className="space-y-4">
            {/* Ambiente */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Ambiente</label>
              <div className="flex gap-3">
                {(['SANDBOX','PRODUCTION'] as const).map(env => (
                  <button key={env} onClick={() => setEnv(env)}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
                      environment === env
                        ? env === 'SANDBOX' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>
                    <span className="text-base">{env === 'SANDBOX' ? '🧪' : '🚀'}</span>
                    <span>{env === 'SANDBOX' ? 'Sandbox' : 'Produção'}</span>
                    <span className="text-xs font-normal opacity-70">{env === 'SANDBOX' ? 'Testes sem cobrança real' : 'Cobranças reais (PIX, boleto)'}</span>
                  </button>
                ))}
              </div>
              {environment === 'PRODUCTION' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                  Modo Produção: cobranças serão realizadas com dinheiro real.
                </div>
              )}
            </div>

            <SecretInput
              id="asaas-key"
              label="Asaas Access Token (API Key)"
              value={apiKey} onChange={setApiKey}
              placeholder={environment === 'SANDBOX' ? '$aact_YTU5YTE0M2M2N...' : '$aact_PROD_xxxxx...'}
              helpText={`Chave de acesso ${environment === 'SANDBOX' ? 'Sandbox' : 'Produção'} disponível em: Configurações → Integrações → Chave API`}
              required
            />
          </div>
        </section>

        <hr className="border-slate-100"/>

        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5"/> Webhook Asaas
          </h3>
          <ReadOnlyField
            label="URL do Webhook (cole no painel Asaas)" value={webhookUrl}
            copy={copy} copied={copied} copyKey="asaas-webhook"
            icon={<Globe className="w-3.5 h-3.5"/>}
          />
          <p className="text-xs text-slate-400 mt-2 bg-slate-50 rounded-lg p-3 leading-relaxed">
            No Asaas: <strong>Configurações → Notificações (Webhooks)</strong> → cole a URL acima e marque os eventos: <em>PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_CONFIRMED</em>
          </p>
        </section>

        <TestBanner result={testResult}/>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
          {testing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> : <Zap className="w-4 h-4 text-amber-500"/>}
          {testing ? 'Testando...' : 'Testar Conexão'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200">
          {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
          {saving ? 'Salvando...' : 'Salvar Asaas'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ABA: PLATAFORMA (SMARTGPS)
══════════════════════════════════════════════════════════════ */
function SmartGpsTab({ integration, tenantId, onSave, onTest, copied, copy }: {
  integration: Integration; tenantId: string
  onSave: (d: Partial<Integration>) => Promise<void>
  onTest: (d: Partial<Integration>) => Promise<{ok:boolean;message:string;latencyMs?:number}>
  copied: string | null; copy: (v: string, k: string) => void
}) {
  const parseMeta = (raw?: string) => {
    try { return JSON.parse(raw || '{}') } catch { return {} }
  }
  const meta = parseMeta(integration.metadata)

  const [token, setToken]     = useState(integration.apiKey || '')
  const [baseUrl, setBaseUrl] = useState(meta.baseUrl || 'https://api.smartgps.com.br')
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ok:boolean;message:string;latencyMs?:number}|null>(null)

  const lastOk = integration.lastTestOk === 1 || integration.lastTestOk === true

  const handleSave = async () => {
    setSaving(true)
    await onSave({ apiKey: token, metadata: JSON.stringify({ baseUrl }) })
    setSaving(false)
  }

  const handleTest = async () => {
    if (!token) { setTestResult({ ok: false, message: '⚠️ Informe o Token antes de testar.' }); return }
    setTesting(true); setTestResult(null)
    const r = await onTest({ apiKey: token, apiSecret: baseUrl })
    setTestResult(r); setTesting(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Satellite className="w-5 h-5 text-indigo-600"/>
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Plataforma — SmartGPS</h2>
            <p className="text-xs text-slate-400">Telemetria, rastreamento veicular e IoT</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${lastOk ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {lastOk ? <Wifi className="w-3.5 h-3.5"/> : <WifiOff className="w-3.5 h-3.5"/>}
          {lastOk ? 'Conectado' : 'Não testado'}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-indigo-700 space-y-0.5">
            <p className="font-semibold">Integração SmartGPS:</p>
            <p>Esta integração permite sincronizar dados de veículos, alertas de fadiga, cercas eletrônicas e posições GPS em tempo real com o CRM ProspecLead.</p>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Parâmetros de Conexão</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5"/> URL Base da API
              </label>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.smartgps.com.br"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              <p className="text-xs text-slate-400 mt-1.5">URL base fornecida pelo SmartGPS. Não inclua barra no final.</p>
            </div>

            <SecretInput
              id="smartgps-token"
              label="Token de Integração"
              value={token} onChange={setToken}
              placeholder="sgps_xxxxxxxxxxxxxxxx"
              helpText="Token de API disponível em: Painel SmartGPS → Configurações → Desenvolvedores → Token de Acesso"
              required
              prefix={<Satellite className="w-3.5 h-3.5"/>}
            />
          </div>
        </section>

        <hr className="border-slate-100"/>

        {/* Dados sincronizados */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dados Sincronizados</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '🚛', label: 'Posição GPS em tempo real' },
              { icon: '😴', label: 'Alertas de fadiga (DMS)' },
              { icon: '🔑', label: 'Bloqueio de partida' },
              { icon: '📍', label: 'Cercas eletrônicas' },
              { icon: '🎥', label: 'Câmeras ADAS/360°' },
              { icon: '📊', label: 'Telemetria de frota' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <TestBanner result={testResult}/>

        {/* Última vez testado */}
        {integration.lastTestedAt && (
          <p className="text-xs text-slate-400 text-right">
            Último teste: {new Date(integration.lastTestedAt).toLocaleString('pt-BR')} —{' '}
            <span className={integration.lastTestOk ? 'text-emerald-600' : 'text-red-500'}>
              {integration.lastTestMsg || (integration.lastTestOk ? 'OK' : 'Falhou')}
            </span>
          </p>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
          {testing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> : <Zap className="w-4 h-4 text-amber-500"/>}
          {testing ? 'Testando...' : 'Testar Conexão'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200">
          {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
          {saving ? 'Salvando...' : 'Salvar SmartGPS'}
        </button>
      </div>
    </div>
  )
}
