/**
 * GET    /api/products/[id]
 * PATCH  /api/products/[id]
 * DELETE /api/products/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard de roles: ADMIN_MASTER | FINANCIAL | MANAGER | TEAM_LEADER
 * Suporte a sessão web (cookie) e token mobile (Bearer header).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { verifyMobileToken }         from '@/lib/mobile-auth'
import { prisma }                    from '@/lib/prisma'

type Params = { params: { id: string } }

// ─── Constantes ───────────────────────────────────────────────────────────────
const PRODUCT_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER', 'TEAM_LEADER'] as const
const VALID_TYPES   = ['HARDWARE', 'SUBSCRIPTION_PLAN'] as const
const VALID_CYCLES  = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME'] as const

// ─── Guard ────────────────────────────────────────────────────────────────────
async function requireProductRole(req: NextRequest) {
  const webSession = await getSession()
  if (webSession && (PRODUCT_ROLES as readonly string[]).includes(webSession.role)) {
    return { userId: webSession.userId, role: webSession.role, tenantId: webSession.tenantId }
  }
  const mobilePayload = await verifyMobileToken(req)
  if (mobilePayload && (PRODUCT_ROLES as readonly string[]).includes(mobilePayload.role)) {
    return { userId: mobilePayload.sub, role: mobilePayload.role, tenantId: mobilePayload.tenantId }
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

function parseBillingCycles(raw: unknown): string[] | null {
  if (!raw) return null
  let arr: unknown[]
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return null }
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    return null
  }
  if (!arr.every(c => VALID_CYCLES.includes(c as typeof VALID_CYCLES[number]))) return null
  return arr as string[]
}

function deserializeCycles(raw: string | null): string[] {
  if (!raw) return ['MONTHLY']
  try { return JSON.parse(raw) } catch { return ['MONTHLY'] }
}

function formatProduct(p: Record<string, unknown>) {
  return { ...p, billingCycles: deserializeCycles(p.billingCycles as string | null) }
}

// ─── GET /api/products/[id] ───────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireProductRole(req)
  if (!session) return err('Não autenticado ou sem permissão.', 401)

  const raw = await prisma.product.findUnique({
    where:   { id: params.id },
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })
  if (!raw) return err('Produto não encontrado.', 404)

  // Tenant guard: MANAGER/TEAM_LEADER só veem produtos do seu tenant
  if (['MANAGER', 'TEAM_LEADER'].includes(session.role)
      && session.tenantId
      && raw.tenantId !== session.tenantId) {
    return err('Produto não encontrado.', 404) // não revela que existe
  }

  return NextResponse.json({ success: true, product: formatProduct(raw as unknown as Record<string, unknown>) })
}

// ─── PATCH /api/products/[id] ─────────────────────────────────────────────────
// Aceita qualquer subconjunto dos campos do produto (partial update).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireProductRole(req)
  if (!session) return err('Não autenticado ou sem permissão.', 401)

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return err('Produto não encontrado.', 404)

  // Tenant guard
  if (['MANAGER', 'TEAM_LEADER'].includes(session.role)
      && session.tenantId
      && existing.tenantId !== session.tenantId) {
    return err('Produto não encontrado.', 404)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Body inválido. Envie JSON.', 400)
  }

  const {
    name, type, description,
    price, commissionPercentage,
    tenantId, isActive,
    // Novos campos
    setupFee, allowCreditCardInstallments, maxInstallments, billingCycles: rawCycles,
  } = body

  const data: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return err('Nome inválido.', 400)
    data.name = name.trim()
  }
  if (type !== undefined) {
    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return err(`Tipo inválido. Use: ${VALID_TYPES.join(' | ')}`, 400)
    }
    data.type = type
  }
  if (description !== undefined) data.description = (description as string)?.trim() || null

  if (price !== undefined) {
    if (typeof price !== 'number' || price < 0) return err('Preço inválido.', 400)
    data.price = price
  }
  if (commissionPercentage !== undefined) {
    const c = commissionPercentage as number
    if (typeof c !== 'number' || c < 0 || c > 100) return err('Comissão deve ser entre 0 e 100.', 400)
    data.commissionPercentage = c
  }

  // Somente ADMIN_MASTER e FINANCIAL podem alterar o tenant de um produto
  if (tenantId !== undefined) {
    if (['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) {
      data.tenantId = (tenantId as string) || null
    }
    // Silenciosamente ignora para MANAGER/TEAM_LEADER
  }

  if (isActive !== undefined) data.isActive = Boolean(isActive)

  /* ── Novos campos: Adesão + Parcelamento ─────────────────────────────────── */
  if (setupFee !== undefined) {
    const sf = setupFee as number
    if (typeof sf !== 'number' || sf < 0) return err('setupFee deve ser >= 0.', 400)
    data.setupFee = sf
  }

  if (allowCreditCardInstallments !== undefined) {
    data.allowCreditCardInstallments = Boolean(allowCreditCardInstallments)
  }

  if (maxInstallments !== undefined) {
    const mi = maxInstallments as number
    if (!Number.isInteger(mi) || mi < 1 || mi > 72) {
      return err('maxInstallments deve ser um inteiro entre 1 e 72.', 400)
    }
    data.maxInstallments = mi
  }

  if (rawCycles !== undefined) {
    const cycles = parseBillingCycles(rawCycles)
    if (!cycles) {
      return err(`billingCycles inválido. Use: ${VALID_CYCLES.join(', ')}`, 400)
    }
    data.billingCycles = JSON.stringify(cycles)
  }

  const raw = await prisma.product.update({
    where:   { id: params.id },
    data,
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })

  return NextResponse.json({ success: true, product: formatProduct(raw as unknown as Record<string, unknown>) })
}

// ─── DELETE /api/products/[id] ────────────────────────────────────────────────
// Soft-delete: seta isActive = false
// Apenas ADMIN_MASTER e FINANCIAL podem deletar (MANAGER/TEAM_LEADER: 403)
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireProductRole(req)
  if (!session) return err('Não autenticado ou sem permissão.', 401)

  if (!['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) {
    return err('Apenas ADMIN_MASTER e FINANCIAL podem remover produtos.', 403)
  }

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return err('Produto não encontrado.', 404)

  const product = await prisma.product.update({
    where: { id: params.id },
    data:  { isActive: false },
  })

  return NextResponse.json({ success: true, product })
}
