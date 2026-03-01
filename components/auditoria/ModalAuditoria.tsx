'use client'

import { useState, useEffect, useCallback } from 'react'

/* ─────────── Types ─────────── */
export interface Lead {
  id: string
  nomeCliente: string
  telefone: string | null
  veiculo: string
  placa: string
  praca: string
  platePhotoUrl: string | null
  status: string
  commissionValue: number
  createdAt: string
  tenant: { nome: string; slug: string } | null
}

interface ModalAuditoriaProps {
  lead: Lead | null
  onClose: () => void
  onAuditado: (id: string, acao: 'aprovar' | 'rejeitar') => void
}

/* ─────────── Toast ─────────── */
export function Toast({ msg, tipo, onHide }: { msg: string; tipo: 'success' | 'error'; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 3500)
    return () => clearTimeout(t)
  }, [onHide])

  return (
    <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border max-w-sm toast-enter ${
      tipo === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${tipo === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
        {tipo === 'success' ? (
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold">{msg}</p>
      <button onClick={onHide} className="ml-2 text-slate-400 hover:text-slate-600">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/* ─────────── Modal de Auditoria ─────────── */
export function ModalAuditoria({ lead, onClose, onAuditado }: ModalAuditoriaProps) {
  const [loading, setLoading]           = useState<'aprovar' | 'rejeitar' | null>(null)
  const [showRejeicao, setShowRejeicao] = useState(false)
  const [motivo, setMotivo]             = useState('')
  const [imgError, setImgError]         = useState(false)
  const [imgZoom, setImgZoom]           = useState(false)

  // Fechar com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!lead) return null

  async function handleAcao(acao: 'aprovar' | 'rejeitar') {
    if (!lead) return
    if (acao === 'rejeitar' && !showRejeicao) { setShowRejeicao(true); return }

    setLoading(acao)
    try {
      const res = await fetch(`/api/leads/auditoria/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, motivoRejeicao: motivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAuditado(lead.id, acao)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(null)
    }
  }

  const placeholderImg = 'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80'

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Auditoria de Foto de Placa</h2>
              <p className="text-slate-400 text-sm mt-0.5">Confira a foto e decida a comissão</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Info do Lead */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-slate-800 font-bold text-sm">{lead.nomeCliente}</p>
                {lead.telefone && <p className="text-slate-500 text-xs mt-0.5">{lead.telefone}</p>}
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Praça</p>
                <p className="text-slate-800 font-bold text-sm">{lead.praca}</p>
                {lead.tenant && <p className="text-slate-500 text-xs mt-0.5">{lead.tenant.nome}</p>}
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Veículo</p>
                <p className="text-slate-800 font-bold text-sm">{lead.veiculo}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Placa Digitada</p>
                <p className="text-amber-800 font-black text-2xl tracking-[0.3em]">{lead.placa}</p>
              </div>
            </div>

            {/* Foto da Placa */}
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Foto Enviada pelo App</p>
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgError ? placeholderImg : (lead.platePhotoUrl || placeholderImg)}
                  alt={`Foto placa ${lead.placa}`}
                  className={`w-full object-cover cursor-zoom-in transition-transform duration-300 ${imgZoom ? 'scale-150' : 'scale-100'}`}
                  style={{ maxHeight: imgZoom ? '600px' : '280px', objectFit: 'cover' }}
                  onError={() => setImgError(true)}
                  onClick={() => setImgZoom(!imgZoom)}
                />
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm">
                  {imgZoom ? 'Clique para reduzir' : 'Clique para ampliar'}
                </div>
              </div>
              <p className="text-center text-slate-400 text-xs mt-2">
                Compare a placa da foto com o código digitado:&nbsp;
                <span className="font-black text-amber-600 tracking-widest">{lead.placa}</span>
              </p>
            </div>

            {/* Campo motivo rejeição */}
            {showRejeicao && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in-up">
                <p className="text-red-700 text-sm font-semibold mb-2">Motivo da Rejeição (opcional)</p>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex: Foto desfocada, placa ilegível, imagem incorreta..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-white border border-red-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm resize-none"
                />
              </div>
            )}

            {/* Botões de Ação */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {/* Rejeitar */}
              <button
                onClick={() => handleAcao('rejeitar')}
                disabled={loading !== null}
                className="flex flex-col items-center gap-2 p-4 bg-red-50 hover:bg-red-100 border-2 border-red-200 hover:border-red-300 rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading === 'rejeitar' ? (
                  <svg className="animate-spin w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div className="text-center">
                  <p className="text-red-700 font-bold text-sm">
                    {showRejeicao ? 'Confirmar Rejeição' : 'Rejeitar Foto'}
                  </p>
                  <p className="text-red-500 text-xs font-medium mt-0.5">Pagar R$ 1,00</p>
                </div>
              </button>

              {/* Aprovar */}
              <button
                onClick={() => handleAcao('aprovar')}
                disabled={loading !== null}
                className="flex flex-col items-center gap-2 p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-100 group"
              >
                {loading === 'aprovar' ? (
                  <svg className="animate-spin w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div className="text-center">
                  <p className="text-emerald-700 font-bold text-sm">Aprovar Placa</p>
                  <p className="text-emerald-600 text-xs font-semibold mt-0.5">Pagar R$ 2,00 ✓</p>
                </div>
              </button>
            </div>

            {showRejeicao && (
              <button onClick={() => { setShowRejeicao(false); setMotivo('') }}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-sm transition-colors">
                Cancelar rejeição
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
