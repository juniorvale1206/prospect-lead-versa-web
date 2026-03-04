'use client'

import { useState, useCallback, useRef } from 'react'

/* ─────────────────────────────────────── Types ─── */
export interface CnpjData {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  situacaoCadastral: string
  cnae: string
  cnaeDescricao: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
  porte: string
  qsa: { nome: string; qual: string }[]
}

interface Props {
  value?: string
  onChange?: (cnpj: string) => void
  onEnrich?: (data: CnpjData) => void
  disabled?: boolean
  error?: string
  className?: string
  showEnrichButton?: boolean
  autoEnrich?: boolean          // Enrich automaticamente ao sair do campo (onBlur)
}

/* ─────────────────────────────────────── Helpers ─── */
function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0,2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8)}`
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`
}

function isValidCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1+$/.test(d)) return false
  const calc = (n: number) => {
    let sum = 0
    const weights = n === 13
      ? [5,4,3,2,9,8,7,6,5,4,3,2]
      : [6,5,4,3,2,9,8,7,6,5,4,3,2]
    for (let i = 0; i < weights.length; i++) sum += parseInt(d[i]) * weights[i]
    const rem = sum % 11
    return rem < 2 ? 0 : 11 - rem
  }
  return calc(13) === parseInt(d[12]) && calc(14) === parseInt(d[13])
}

/* ─────────────────────────────────────── Component ─── */
export default function CnpjInput({
  value = '', onChange, onEnrich, disabled = false, error,
  className = '', showEnrichButton = true, autoEnrich = false
}: Props) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'invalid'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCnpj(e.target.value)
    onChange?.(masked)
    setStatus('idle')
    setStatusMsg('')

    // Auto-enrich com debounce quando CNPJ completo
    if (autoEnrich && masked.replace(/\D/g, '').length === 14) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doEnrich(masked), 800)
    }
  }

  const handleBlur = () => {
    if (!autoEnrich) return
    const digits = value.replace(/\D/g, '')
    if (digits.length === 14) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      doEnrich(value)
    }
  }

  const doEnrich = useCallback(async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '')
    if (clean.length !== 14) { setStatus('invalid'); setStatusMsg('CNPJ deve ter 14 dígitos'); return }
    if (!isValidCnpj(clean)) { setStatus('invalid'); setStatusMsg('CNPJ inválido'); return }

    setLoading(true)
    setStatus('idle')
    setStatusMsg('')

    try {
      // Tenta a rota interna primeiro
      const res = await fetch(`/api/prospeccao/enrich-cnpj?cnpj=${clean}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Empresa não encontrada')
      }

      setStatus('success')
      setStatusMsg(`✅ ${data.razaoSocial || 'Empresa encontrada'}`)
      showToast(`✅ Dados preenchidos: ${data.razaoSocial}`)
      onEnrich?.(data as CnpjData)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar CNPJ'
      setStatus('error')
      setStatusMsg(`⚠️ ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [onEnrich])

  const digits = value.replace(/\D/g, '')
  const isComplete = digits.length === 14
  const isValid = isComplete && isValidCnpj(digits)

  const borderClass = {
    idle:    'border-slate-200 focus:ring-indigo-500',
    success: 'border-emerald-400 focus:ring-emerald-500',
    error:   'border-red-400 focus:ring-red-400',
    invalid: 'border-amber-400 focus:ring-amber-400',
  }[status]

  return (
    <div className={`relative ${className}`}>
      {/* Toast */}
      {toast && (
        <div className="absolute -top-10 left-0 right-0 z-50 bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg shadow text-center">
          {toast}
        </div>
      )}

      <div className="flex gap-2">
        {/* Input principal */}
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled || loading}
            maxLength={18}
            className={`w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-white ${borderClass}`}
          />

          {/* Ícone esquerda */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            🏢
          </div>

          {/* Ícone de status direita */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {loading && (
              <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            )}
            {!loading && status === 'success' && <span className="text-emerald-500">✓</span>}
            {!loading && (status === 'error' || status === 'invalid') && <span className="text-red-400">✕</span>}
            {!loading && status === 'idle' && isComplete && isValid && <span className="text-slate-300 text-xs">14</span>}
          </div>
        </div>

        {/* Botão Lupa */}
        {showEnrichButton && (
          <button
            type="button"
            onClick={() => doEnrich(value)}
            disabled={!isComplete || loading || disabled}
            title="Buscar dados da empresa (BrasilAPI / ReceitaWS)"
            className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : '🔍'}
            <span className="hidden sm:inline">{loading ? 'Buscando...' : 'Buscar'}</span>
          </button>
        )}
      </div>

      {/* Mensagem de status ou erro externo */}
      {(statusMsg || error) && (
        <p className={`text-xs mt-1.5 ${
          error ? 'text-red-500' :
          status === 'success' ? 'text-emerald-600' :
          status === 'error' || status === 'invalid' ? 'text-amber-600' : 'text-slate-500'
        }`}>
          {error || statusMsg}
        </p>
      )}
    </div>
  )
}
