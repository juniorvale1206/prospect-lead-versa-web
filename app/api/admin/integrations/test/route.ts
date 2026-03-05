/**
 * POST /api/admin/integrations/test
 * Valida a conectividade de uma integração específica fazendo
 * um "ping" no provider com as credenciais fornecidas.
 *
 * Body: { provider, apiKey, apiKeyAux?, apiSecret?, environment?, tenantId? }
 *
 * Retorna: { ok: boolean, status: number, message: string, latencyMs: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ ok: false, message: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { provider, apiKey, apiKeyAux, apiSecret, environment } = body

  if (!provider || !apiKey) {
    return NextResponse.json({
      ok: false, message: 'provider e apiKey são obrigatórios para o teste'
    }, { status: 400 })
  }

  const t0 = Date.now()

  try {
    let result: TestResult

    switch (provider) {
      case 'WHATSAPP_META':
        result = await testWhatsappMeta(apiKey, apiKeyAux)
        break
      case 'ASAAS':
        result = await testAsaas(apiKey, environment || 'SANDBOX')
        break
      case 'SMART_GPS':
        result = await testSmartGps(apiKey, apiSecret)
        break
      default:
        result = { ok: false, status: 400, message: `Provider desconhecido: ${provider}` }
    }

    return NextResponse.json({
      ...result,
      latencyMs: Date.now() - t0,
      testedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: 500,
      message: `Erro inesperado: ${(err as Error).message}`,
      latencyMs: Date.now() - t0,
    })
  }
}

/* ────────────────────────────────── Test functions ── */

interface TestResult {
  ok: boolean
  status: number
  message: string
  details?: Record<string, unknown>
}

/** WhatsApp Cloud API: GET /me com Bearer token */
async function testWhatsappMeta(accessToken: string, phoneNumberId?: string): Promise<TestResult> {
  try {
    // Testa se o token é válido consultando o phone number (se fornecido) ou /me
    const url = phoneNumberId
      ? `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=id,display_phone_number,verified_name`
      : `https://graph.facebook.com/v19.0/me?fields=id,name`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })

    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errMsg = (json.error as Record<string, unknown>)?.message as string || 'Token inválido'
      return { ok: false, status: res.status, message: `❌ Meta API: ${errMsg}` }
    }

    const name = (json.verified_name || json.display_phone_number || json.name || json.id) as string
    return {
      ok: true, status: 200,
      message: `✅ Token válido! ${phoneNumberId ? `Número: ${name}` : `Conta: ${name}`}`,
      details: json,
    }
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      return { ok: false, status: 408, message: '⏱️ Timeout ao conectar com a Meta API' }
    }
    return { ok: false, status: 0, message: `🔌 Sem conexão: ${(err as Error).message}` }
  }
}

/** Asaas API: GET /finance/balance */
async function testAsaas(apiKey: string, environment: string): Promise<TestResult> {
  const base = environment === 'PRODUCTION'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3'

  try {
    const res = await fetch(`${base}/finance/balance`, {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(8000),
    })

    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return {
        ok: false, status: res.status,
        message: `❌ Asaas: ${json.errors ? JSON.stringify(json.errors) : 'API Key inválida'}`,
      }
    }

    return {
      ok: true, status: 200,
      message: `✅ Asaas conectado (${environment})! Saldo: R$ ${Number(json.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      details: { balance: json.balance, environment },
    }
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      return { ok: false, status: 408, message: '⏱️ Timeout ao conectar com a Asaas API' }
    }
    return { ok: false, status: 0, message: `🔌 Sem conexão: ${(err as Error).message}` }
  }
}

/** SmartGPS: GET /v2/ping ou endpoint de autenticação */
async function testSmartGps(token: string, baseUrl?: string): Promise<TestResult> {
  const base = baseUrl || 'https://api.smartgps.com.br'

  try {
    // Tenta endpoint de ping/vehicles (SmartGPS API)
    const res = await fetch(`${base}/v2/vehicles?limit=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: '❌ SmartGPS: Token inválido ou sem permissão' }
    }
    if (res.status === 404) {
      // Endpoint não encontrado mas autenticação OK (API responde)
      return { ok: true, status: 200, message: '✅ SmartGPS conectado! (endpoint /v2/vehicles não encontrado mas token aceito)' }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, message: `❌ SmartGPS: HTTP ${res.status}` }
    }

    const json = await res.json() as Record<string, unknown>
    const count = Array.isArray(json) ? json.length : (json.total || json.count || '?')
    return {
      ok: true, status: 200,
      message: `✅ SmartGPS conectado! ${count} veículo(s) na conta.`,
      details: { base, vehicleCount: count },
    }
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      return { ok: false, status: 408, message: '⏱️ Timeout ao conectar com SmartGPS' }
    }
    return { ok: false, status: 0, message: `🔌 Sem conexão com ${base}: ${(err as Error).message}` }
  }
}
