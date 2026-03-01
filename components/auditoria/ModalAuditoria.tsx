'use client'

import { useState, useEffect } from 'react'

/* ─────────────────────────── Types ─────────────────────────── */
export interface Lead {
  id: string
  nomeCliente: string
  telefone: string | null
  email: string | null
  veiculo: string
  placa: string
  praca: string
  platePhotoUrl: string | null
  status: string
  commissionValue: number
  createdAt: string
  motivoRejeicao?: string | null
  tenant: { nome: string; slug: string } | null
  auditadoPor?: { nome: string } | null
  auditadoEm?: string | null
}

interface ModalAuditoriaProps {
  lead: Lead | null
  onClose: () => void
  onAuditado: (id: string, acao: 'aprovar' | 'rejeitar') => void
}

/* ─────────────────────────── Toast ─────────────────────────── */
export function Toast({
  msg,
  tipo,
  onHide,
}: {
  msg: string
  tipo: 'success' | 'error'
  onHide: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onHide, 4000)
    return () => clearTimeout(t)
  }, [onHide])

  return (
    <div
      className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border max-w-sm toast-enter ${
        tipo === 'success'
          ? 'bg-white border-emerald-200 shadow-emerald-100'
          : 'bg-white border-red-200 shadow-red-100'
      }`}
    >
      {/* Ícone */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          tipo === 'success' ? 'bg-emerald-100' : 'bg-red-100'
        }`}
      >
        {tipo === 'success' ? (
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      {/* Texto */}
      <div className="flex-1">
        <p
          className={`text-sm font-bold ${
            tipo === 'success' ? 'text-emerald-800' : 'text-red-700'
          }`}
        >
          {tipo === 'success' ? 'Auditoria concluída!' : 'Foto rejeitada'}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">{msg}</p>
      </div>
      <button
        onClick={onHide}
        className="text-slate-300 hover:text-slate-500 transition-colors ml-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/* ─────────────────────── Modal de Auditoria ─────────────────── */
export function ModalAuditoria({ lead, onClose, onAuditado }: ModalAuditoriaProps) {
  const [loading, setLoading]           = useState<'aprovar' | 'rejeitar' | null>(null)
  const [etapa, setEtapa]               = useState<'visualizar' | 'rejeitar'>('visualizar')
  const [motivo, setMotivo]             = useState('')
  const [motivoErro, setMotivoErro]     = useState(false)
  const [imgZoom, setImgZoom]           = useState(false)
  const [imgLoaded, setImgLoaded]       = useState(false)
  const [imgError, setImgError]         = useState(false)

  // Reset ao abrir novo lead
  useEffect(() => {
    setEtapa('visualizar')
    setMotivo('')
    setMotivoErro(false)
    setImgZoom(false)
    setImgLoaded(false)
    setImgError(false)
    setLoading(null)
  }, [lead?.id])

  // ESC para fechar
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, loading])

  if (!lead) return null

  const PLACEHOLDER = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80'

  async function executarAcao(acao: 'aprovar' | 'rejeitar') {
    if (acao === 'rejeitar' && etapa === 'visualizar') {
      setEtapa('rejeitar')
      return
    }
    setLoading(acao)
    try {
      const res = await fetch(`/api/leads/auditoria/${lead!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          motivoRejeicao: motivo.trim() || 'Foto inadequada para auditoria',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAuditado(lead!.id, acao)
    } catch (err) {
      console.error('Erro auditoria:', err)
      setLoading(null)
    }
  }

  const fmtData = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[680px] max-h-[95vh] overflow-hidden flex flex-col animate-fade-in-up">

        {/* ── Cabeçalho ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-tight">Auditoria de Placa</h2>
              <p className="text-slate-400 text-xs">Verifique a foto e decida a comissão</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!!loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Corpo com scroll ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Grid de info do lead */}
          <div className="grid grid-cols-2 gap-3 p-6 pb-4">
            <InfoCard label="Cliente" icon="👤">
              <p className="font-bold text-slate-800 text-sm">{lead.nomeCliente}</p>
              {lead.telefone && <p className="text-slate-400 text-xs mt-0.5">{lead.telefone}</p>}
            </InfoCard>

            <InfoCard label="Veículo" icon="🚗">
              <p className="font-bold text-slate-800 text-sm leading-tight">{lead.veiculo}</p>
            </InfoCard>

            <InfoCard label="Praça / Local" icon="📍">
              <p className="font-bold text-slate-800 text-sm">{lead.praca}</p>
              {lead.tenant && (
                <span className="inline-block mt-1 text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {lead.tenant.nome}
                </span>
              )}
            </InfoCard>

            {/* PLACA — destaque especial */}
            <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl p-4 flex flex-col justify-between shadow-md shadow-amber-200">
              <p className="text-amber-900 text-[10px] font-bold uppercase tracking-widest opacity-75">
                🔎 Placa Digitada
              </p>
              <div className="mt-1">
                <p className="text-white font-black text-3xl tracking-[0.35em] drop-shadow">
                  {lead.placa}
                </p>
                <p className="text-amber-900 text-[10px] mt-1 opacity-75">Compare com a foto abaixo</p>
              </div>
            </div>
          </div>

          {/* ── Foto da Placa ── */}
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                📸 Foto enviada pelo app
              </p>
              <button
                onClick={() => setImgZoom(!imgZoom)}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={imgZoom ? 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7' : 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7'} />
                </svg>
                {imgZoom ? 'Reduzir' : 'Ampliar'}
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner">
              {/* Skeleton loading */}
              {!imgLoaded && !imgError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="animate-spin w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <p className="text-slate-400 text-xs">Carregando foto...</p>
                  </div>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgError ? PLACEHOLDER : (lead.platePhotoUrl || PLACEHOLDER)}
                alt={`Foto placa ${lead.placa}`}
                onLoad={() => setImgLoaded(true)}
                onError={() => { setImgError(true); setImgLoaded(true) }}
                onClick={() => setImgZoom(!imgZoom)}
                className={`w-full object-cover cursor-zoom-in transition-all duration-300 ${
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                } ${imgZoom ? 'max-h-[520px]' : 'max-h-[260px]'}`}
              />

              {/* Badge "SIMULADA" se usou placeholder */}
              {imgError && (
                <div className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg">
                  ⚠️ Imagem simulada
                </div>
              )}

              {/* Watermark placa */}
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs font-black px-3 py-1.5 rounded-xl tracking-widest">
                {lead.placa}
              </div>
            </div>

            {/* Dica visual */}
            <div className="mt-2 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className="text-amber-700 text-xs font-semibold">
                A placa na foto deve corresponder a{' '}
                <span className="font-black tracking-widest">{lead.placa}</span>
              </p>
            </div>
          </div>

          {/* ── Etapa Rejeição: campo de motivo ── */}
          {etapa === 'rejeitar' && (
            <div className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-red-700 text-sm font-bold">Informe o motivo da rejeição</p>
              </div>

              {/* Motivos rápidos */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  'Foto desfocada',
                  'Placa ilegível',
                  'Imagem incorreta',
                  'Veículo errado',
                  'Foto duplicada',
                ].map(m => (
                  <button
                    key={m}
                    onClick={() => setMotivo(m)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      motivo === m
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-red-600 border-red-200 hover:bg-red-100'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <textarea
                value={motivo}
                onChange={e => { setMotivo(e.target.value); setMotivoErro(false) }}
                placeholder="Ou descreva o motivo livremente..."
                rows={2}
                className={`w-full px-3 py-2.5 bg-white border rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 text-sm resize-none transition-all ${
                  motivoErro
                    ? 'border-red-400 focus:ring-red-300'
                    : 'border-red-200 focus:ring-red-300'
                }`}
              />
              {motivoErro && (
                <p className="text-red-500 text-xs mt-1 font-medium">
                  Selecione ou informe o motivo antes de confirmar
                </p>
              )}

              <button
                onClick={() => { setEtapa('visualizar'); setMotivo(''); setMotivoErro(false) }}
                className="mt-2 text-slate-400 hover:text-slate-600 text-xs transition-colors"
              >
                ← Voltar para a foto
              </button>
            </div>
          )}

          {/* Dados de captura */}
          <div className="mx-6 mb-6 flex items-center justify-between text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-2.5">
            <span>📅 Capturado em: {fmtData(lead.createdAt)}</span>
            <span className="font-semibold text-slate-500">Comissão atual: R$ {lead.commissionValue.toFixed(2)}</span>
          </div>
        </div>

        {/* ── Footer: botões de ação ── */}
        <div className="border-t border-slate-100 p-5 flex-shrink-0 bg-white">
          {etapa === 'visualizar' ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Rejeitar */}
              <button
                onClick={() => executarAcao('rejeitar')}
                disabled={loading !== null}
                className="group flex items-center justify-center gap-2.5 px-5 py-3.5 bg-red-50 hover:bg-red-100 border-2 border-red-200 hover:border-red-300 text-red-700 font-bold text-sm rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p>Rejeitar Foto</p>
                  <p className="text-red-400 font-normal text-xs">Pagar R$ 1,00</p>
                </div>
              </button>

              {/* Aprovar */}
              <button
                onClick={() => executarAcao('aprovar')}
                disabled={loading !== null}
                className="group flex items-center justify-center gap-2.5 px-5 py-3.5 bg-emerald-500 hover:bg-emerald-600 border-2 border-emerald-500 hover:border-emerald-600 text-white font-bold text-sm rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200 hover:shadow-emerald-300"
              >
                {loading === 'aprovar' ? (
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div className="text-left">
                  <p>Aprovar Placa</p>
                  <p className="text-emerald-200 font-normal text-xs">Pagar R$ 2,00 ✓</p>
                </div>
              </button>
            </div>
          ) : (
            /* Etapa de confirmação da rejeição */
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (!motivo.trim()) { setMotivoErro(true); return }
                  executarAcao('rejeitar')
                }}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold text-sm rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
              >
                {loading === 'rejeitar' ? (
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                Confirmar Rejeição — Pagar R$ 1,00
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────── Info Card Helper ─────────────── */
function InfoCard({
  label,
  icon,
  children,
}: {
  label: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">
        {icon} {label}
      </p>
      {children}
    </div>
  )
}
