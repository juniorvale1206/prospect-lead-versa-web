/**
 * POST /api/products
 * GET  /api/products
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard de roles: ADMIN_MASTER | FINANCIAL | MANAGER | TEAM_LEADER
 *
 * Campos suportados (Adesão + Parcelamento + Assinatura):
 *   setupFee                     Float   — taxa de adesão (default 0)
 *   allowCreditCardInstallments  Boolean — permite parcelamento no cartão
 *   maxInstallments              Int     — máximo de parcelas (1 = à vista)
 *   billingCycles                string[]— ciclos: MONTHLY|QUARTERLY|SEMI_ANNUALLY|ANNUALLY|ONE_TIME
 *   monthlySubscriptionPrice     Float   — valor base mensal da assinatura (só HARDWARE, default 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { verifyMobileToken }         from '@/lib/mobile-auth'
import { prisma }                    from '@/lib/prisma'

// ─── Constantes ───────────────────────────────────────────────────────────────
const PRODUCT_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER', 'TEAM_LEADER'] as const
type ProductRole = typeof PRODUCT_ROLES[number]

const VALID_TYPES    = ['HARDWARE', 'SUBSCRIPTION_PLAN'] as const
const VALID_CYCLES   = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME'] as const

// ─── Guard de roles ───────────────────────────────────────────────────────────
/**
 * Verifica sessão web (cookie) OU token mobile (Bearer).
 * Retorna o payload da sessão ou null se não autorizado.
 */
async function requireProductRole(req: NextRequest): Promise<{
  userId: string
  role: string
  tenantId: string | null
} | null> {
  // 1. Tenta sessão web (cookie)
  const webSession = await getSession()
  if (webSession && (PRODUCT_ROLES as readonly string[]).includes(webSession.role)) {
    return { userId: webSession.userId, role: webSession.role, tenantId: webSession.tenantId }
  }

  // 2. Tenta token mobile (Bearer header)
  const mobilePayload = await verifyMobileToken(req)
  if (mobilePayload && (PRODUCT_ROLES as readonly string[]).includes(mobilePayload.role)) {
    return { userId: mobilePayload.sub, role: mobilePayload.role, tenantId: mobilePayload.tenantId }
  }

  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function err(msg: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: code ? { code, message: msg } : msg }, { status })
}

/**
 * Valida e parseia o array billingCycles.
 * Aceita tanto string JSON quanto array direto.
 */
function parseBillingCycles(raw: unknown): string[] | null {
  if (!raw) return ['MONTHLY'] // default

  let arr: unknown[]
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return null }
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    return null
  }

  if (!arr.every(c => VALID_CYCLES.includes(c as typeof VALID_CYCLES[number]))) {
    return null
  }

  return arr as string[]
}

/**
 * Serializa billingCycles como JSON string para SQLite.
 */
function serializeCycles(cycles: string[]): string {
  return JSON.stringify(cycles)
}

/**
 * Deserializa billingCycles do banco para array.
 */
function deserializeCycles(raw: string | null): string[] {
  if (!raw) return ['MONTHLY']
  try { return JSON.parse(raw) } catch { return ['MONTHLY'] }
}

/**
 * Formata um produto do banco para a resposta da API
 * (converte billingCycles de string para array).
 */
function formatProduct(p: Record<string, unknown>) {
  return {
    ...p,
    billingCycles: deserializeCycles(p.billingCycles as string | null),
  }
}

// ─── GET /api/products ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await requireProductRole(req)
  if (!session) return err('Não autenticado ou sem permissão.', 401, 'UNAUTHORIZED')

  const { searchParams } = new URL(req.url)
  const tenantId  = searchParams.get('tenantId')
  const type      = searchParams.get('type')
  const active    = searchParams.get('active') // 'true' | 'false' | 'all'

  const where: Record<string, unknown> = {}

  // MANAGERs e TEAM_LEADER só veem produtos do seu tenant
  if (['MANAGER', 'TEAM_LEADER'].includes(session.role) && session.tenantId) {
    where.tenantId = session.tenantId
  } else if (tenantId) {
    where.tenantId = tenantId
  }

  if (type)             where.type     = type
  if (active !== 'all') where.isActive = active === 'false' ? false : true

  const raw = await prisma.product.findMany({
    where,
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  const products = raw.map(p => formatProduct(p as unknown as Record<string, unknown>))

  return NextResponse.json({ success: true, products })
}

// ─── POST /api/products ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await requireProductRole(req)
  if (!session) return err('Não autenticado ou sem permissão.', 401, 'UNAUTHORIZED')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Body inválido. Envie JSON.', 400, 'INVALID_BODY')
  }

  /* ── Campos base ─────────────────────────────────────────────────────────── */
  const {
    name,
    type               = 'HARDWARE',
    description,
    price,
    commissionPercentage,
    tenantId,
    isActive,
    // Novos campos: Adesão + Parcelamento + Assinatura mensal
    setupFee,
    allowCreditCardInstallments,
    maxInstallments,
    billingCycles: rawCycles,
    monthlySubscriptionPrice,
  } = body

  /* ── Validações ──────────────────────────────────────────────────────────── */
  if (!name || typeof name !== 'string' || !name.trim()) {
    return err('O nome do produto é obrigatório.', 400, 'VALIDATION_ERROR')
  }

  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    return err(
      `Tipo inválido: "${type}". Use: ${VALID_TYPES.join(' | ')}`,
      400, 'VALIDATION_ERROR',
    )
  }

  if (typeof price !== 'number' || price < 0) {
    return err('O preço deve ser um número maior ou igual a 0.', 400, 'VALIDATION_ERROR')
  }

  const commission = commissionPercentage as number ?? 30
  if (typeof commission !== 'number' || commission < 0 || commission > 100) {
    return err('A comissão deve ser um número entre 0 e 100.', 400, 'VALIDATION_ERROR')
  }

  // ── Validação: setupFee ──────────────────────────────────────────────────
  const setup = (setupFee as number) ?? 0
  if (typeof setup !== 'number' || setup < 0) {
    return err('setupFee deve ser um número >= 0.', 400, 'VALIDATION_ERROR')
  }

  // ── Validação: monthlySubscriptionPrice ───────────────────────────────────
  const monthlySub = (monthlySubscriptionPrice as number) ?? 0
  if (typeof monthlySub !== 'number' || monthlySub < 0) {
    return err('monthlySubscriptionPrice deve ser um número >= 0.', 400, 'VALIDATION_ERROR')
  }

  // ── Validação: maxInstallments ────────────────────────────────────────────
  const maxInst = (maxInstallments as number) ?? 1
  if (!Number.isInteger(maxInst) || maxInst < 1 || maxInst > 72) {
    return err('maxInstallments deve ser um inteiro entre 1 e 72.', 400, 'VALIDATION_ERROR')
  }

  // ── Validação: billingCycles ───────────────────────────────────────────────
  const cycles = parseBillingCycles(rawCycles)
  if (cycles === null) {
    return err(
      `billingCycles inválido. Use um array com: ${VALID_CYCLES.join(', ')}`,
      400, 'VALIDATION_ERROR',
    )
  }

  // ── Validação específica por tipo ──────────────────────────────────────────
  //
  //  SUBSCRIPTION_PLAN:
  //    - setupFee: obrigatório e >= 0 (taxa de instalação)
  //    - billingCycles: forçado para ['MONTHLY'] (mensalidade fixa)
  //
  //  HARDWARE:
  //    - billingCycles: ao menos 1 ciclo entre QUARTERLY, SEMI_ANNUALLY, ANNUALLY
  //    - setupFee: não se aplica (zero)
  //
  if (type === 'SUBSCRIPTION_PLAN') {
    if (setup === null || setup === undefined || isNaN(Number(setup)) || Number(setup) < 0) {
      return err(
        'Para Planos de Assinatura, o campo setupFee (Valor de Instalação/Adesão) é obrigatório e deve ser >= 0.',
        400, 'VALIDATION_ERROR',
      )
    }
  }

  if (type === 'HARDWARE') {
    const hwCycles = cycles ?? []
    const HARDWARE_CYCLES = ['QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME']
    const hasValidCycle   = hwCycles.some(c => HARDWARE_CYCLES.includes(c))
    if (!hasValidCycle) {
      return err(
        'Hardware exige ao menos um ciclo de assinatura: QUARTERLY, SEMI_ANNUALLY ou ANNUALLY.',
        400, 'VALIDATION_ERROR',
      )
    }
  }

  // ── Tenant guard ─────────────────────────────────────────────────────────
  // MANAGER e TEAM_LEADER só podem criar produtos no seu próprio tenant
  let effectiveTenantId = (tenantId as string) || null
  if (['MANAGER', 'TEAM_LEADER'].includes(session.role)) {
    if (!session.tenantId) {
      return err('MANAGER/TEAM_LEADER precisam estar associados a um tenant.', 403, 'FORBIDDEN')
    }
    effectiveTenantId = session.tenantId
  }

  /* ── Criar produto ───────────────────────────────────────────────────────── */
  const raw = await prisma.product.create({
    data: {
      name:                        name.trim(),
      type:                        type as string,
      description:                 (description as string)?.trim() || null,
      price,
      commissionPercentage:        commission,
      isActive:                    (isActive as boolean) !== false,
      // Adesão e parcelamento
      setupFee:                    setup,
      allowCreditCardInstallments: Boolean(allowCreditCardInstallments),
      maxInstallments:             maxInst,
      billingCycles:               serializeCycles(cycles),
      // Assinatura mensal vinculada ao hardware
      monthlySubscriptionPrice:    monthlySub,
      tenantId:                    effectiveTenantId,
    },
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })

  const product = formatProduct(raw as unknown as Record<string, unknown>)

  return NextResponse.json({ success: true, product }, { status: 201 })
}
