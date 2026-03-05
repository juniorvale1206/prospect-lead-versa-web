/**
 * /api/admin/integrations
 * GET  — lista todas as integrações do tenant autenticado
 * POST — upsert (criar ou atualizar) integração por provider
 *
 * Segurança:
 *  - ADMIN_MASTER vê qualquer tenant (via ?tenantId=xxx)
 *  - MANAGER / FINANCIAL vêm apenas o próprio tenant
 *  - API Keys são retornadas MASCARADAS (primeiros 6 + asteriscos) no GET
 *    Use ?reveal=1 (apenas ADMIN_MASTER) para ver o valor completo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

const VALID_PROVIDERS = ['WHATSAPP_META', 'ASAAS', 'SMART_GPS']

// Webhook base URL — em produção usar variável de ambiente
const WEBHOOK_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://api.prospeclead.com'

/** Mascara uma string secreta: mostra só os 6 primeiros chars + *** */
function maskSecret(val: string | null | undefined): string | null {
  if (!val) return null
  if (val.length <= 8) return '••••••••'
  return val.slice(0, 6) + '••••••••••••'
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/admin/integrations ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const reveal    = searchParams.get('reveal') === '1' && session.role === 'ADMIN_MASTER'
  const tenantId  = session.role === 'ADMIN_MASTER'
    ? (searchParams.get('tenantId') || session.tenantId || '')
    : (session.tenantId || '')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId não encontrado' }, { status: 400 })
  }

  try {
    const rows = await prisma.$queryRaw`
      SELECT * FROM TenantIntegration WHERE tenantId = ${tenantId} ORDER BY provider
    ` as Record<string, unknown>[]

    // Mascarar segredos na resposta padrão
    const integrations: Record<string, unknown>[] = rows.map(row => ({
      ...row,
      apiKey:    reveal ? row.apiKey    : maskSecret(row.apiKey as string),
      apiSecret: reveal ? row.apiSecret : maskSecret(row.apiSecret as string),
      apiKeyAux: row.apiKeyAux, // Phone Number ID não é segredo
    }))

    // Gerar webhookUrl padrão para cada provider se não estiver salvo
    const withWebhooks = integrations.map(i => ({
      ...i,
      webhookUrl: (i.webhookUrl as string | null) || buildWebhookUrl(i.provider as string, tenantId),
    }))

    return NextResponse.json({ integrations: withWebhooks, tenantId })
  } catch (err) {
    console.error('[GET /api/admin/integrations]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST /api/admin/integrations — UPSERT ────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { provider, apiKey, apiSecret, apiKeyAux, label, environment, metadata, isActive } = body

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({
      error: `Provider inválido. Use: ${VALID_PROVIDERS.join(', ')}`
    }, { status: 400 })
  }

  const tenantId = session.role === 'ADMIN_MASTER'
    ? (body.tenantId || session.tenantId || '')
    : (session.tenantId || '')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId não encontrado' }, { status: 400 })
  }

  const now          = new Date().toISOString()
  const webhookUrl   = buildWebhookUrl(provider, tenantId)
  const metadataJson = typeof metadata === 'object' ? JSON.stringify(metadata) : (metadata || '{}')

  try {
    // Verificar se já existe
    const existing = await prisma.$queryRaw`
      SELECT id FROM TenantIntegration WHERE tenantId = ${tenantId} AND provider = ${provider}
    ` as { id: string }[]

    let id: string

    if (existing.length) {
      // UPDATE — não sobrescreve campo vazio se já tinha valor (proteção)
      id = existing[0].id

      const updates: string[] = [`updatedAt = '${now}'`, `isActive = ${isActive !== undefined ? (isActive ? 1 : 0) : 1}`]
      const vals: unknown[] = []

      if (apiKey    !== undefined && apiKey    !== '') { updates.push(`apiKey = ?`);    vals.push(apiKey) }
      if (apiSecret !== undefined && apiSecret !== '') { updates.push(`apiSecret = ?`); vals.push(apiSecret) }
      if (apiKeyAux !== undefined)                     { updates.push(`apiKeyAux = ?`); vals.push(apiKeyAux || null) }
      if (label     !== undefined)                     { updates.push(`label = ?`);     vals.push(label || null) }
      if (environment)                                  { updates.push(`environment = ?`); vals.push(environment) }
      if (metadata  !== undefined)                     { updates.push(`metadata = ?`);  vals.push(metadataJson) }

      vals.push(id)
      await prisma.$executeRawUnsafe(
        `UPDATE TenantIntegration SET ${updates.join(', ')} WHERE id = ?`,
        ...vals
      )
    } else {
      // INSERT
      id = randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO TenantIntegration
          (id, tenantId, provider, label, apiKey, apiSecret, apiKeyAux, webhookUrl, environment, metadata, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        id, tenantId, provider, label || null,
        apiKey || null, apiSecret || null, apiKeyAux || null,
        webhookUrl, environment || 'PRODUCTION', metadataJson,
        now, now
      )
    }

    const saved = await prisma.$queryRaw`
      SELECT * FROM TenantIntegration WHERE id = ${id}
    ` as Record<string, unknown>[]

    return NextResponse.json({
      integration: {
        ...saved[0],
        apiKey:    maskSecret(saved[0].apiKey as string),
        apiSecret: maskSecret(saved[0].apiSecret as string),
        webhookUrl,
      }
    }, { status: existing.length ? 200 : 201 })
  } catch (err) {
    console.error('[POST /api/admin/integrations]', err)
    return NextResponse.json({ error: 'Erro ao salvar integração' }, { status: 500 })
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────
function buildWebhookUrl(provider: string, tenantId: string): string {
  const base = WEBHOOK_BASE
  if (provider === 'WHATSAPP_META') return `${base}/api/webhooks/whatsapp?tenant=${tenantId}`
  if (provider === 'ASAAS')        return `${base}/api/webhooks/asaas?tenant=${tenantId}`
  if (provider === 'SMART_GPS')    return `${base}/api/webhooks/smartgps?tenant=${tenantId}`
  return `${base}/api/webhooks/${provider.toLowerCase()}?tenant=${tenantId}`
}
