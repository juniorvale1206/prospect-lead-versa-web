import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Helpers ──────────────────────────────────────────────────────────────────
function isAdminMaster(role: string) {
  return role === 'ADMIN_MASTER'
}

function validationError(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

// ── GET /api/products ─────────────────────────────────────────────────────────
// Query params: ?tenantId=xxx&type=HARDWARE&active=true|false|all
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!isAdminMaster(session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const type     = searchParams.get('type')
  const active   = searchParams.get('active') // 'true' | 'false' | 'all'

  const where: Record<string, unknown> = {}
  if (tenantId)          where.tenantId = tenantId
  if (type)              where.type     = type
  if (active !== 'all')  where.isActive = active === 'false' ? false : true

  const products = await prisma.product.findMany({
    where,
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ products })
}

// ── POST /api/products ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!isAdminMaster(session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { name, type, description, price, commissionPercentage, tenantId, isActive } = body

  // Validações
  if (!name?.trim())                       return validationError('Nome é obrigatório')
  if (!['HARDWARE', 'SUBSCRIPTION_PLAN'].includes(type))
                                           return validationError('Tipo inválido')
  if (typeof price !== 'number' || price < 0)
                                           return validationError('Preço inválido')
  const commission = commissionPercentage ?? 30
  if (commission < 0 || commission > 100) return validationError('Comissão deve ser entre 0 e 100')

  const product = await prisma.product.create({
    data: {
      name:                 name.trim(),
      type,
      description:          description?.trim() || null,
      price,
      commissionPercentage: commission,
      tenantId:             tenantId || null,
      isActive:             isActive !== false,
    },
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })

  return NextResponse.json({ product }, { status: 201 })
}
