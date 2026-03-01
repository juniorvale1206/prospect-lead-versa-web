import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: { id: string } }

function isAdminMaster(role: string) {
  return role === 'ADMIN_MASTER'
}

// ── GET /api/products/[id] ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!isAdminMaster(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const product = await prisma.product.findUnique({
    where:   { id: params.id },
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })
  if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  return NextResponse.json({ product })
}

// ── PATCH /api/products/[id] ──────────────────────────────────────────────────
// Aceita: { name, type, description, price, commissionPercentage, tenantId, isActive }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!isAdminMaster(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  const body = await req.json()
  const {
    name, type, description,
    price, commissionPercentage,
    tenantId, isActive,
  } = body

  // Só atualiza campos enviados
  const data: Record<string, unknown> = {}
  if (name  !== undefined) data.name  = name.trim()
  if (type  !== undefined) {
    if (!['HARDWARE', 'SUBSCRIPTION_PLAN'].includes(type))
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    data.type = type
  }
  if (description          !== undefined) data.description          = description?.trim() || null
  if (price                !== undefined) data.price                = price
  if (commissionPercentage !== undefined) data.commissionPercentage = commissionPercentage
  if (tenantId             !== undefined) data.tenantId             = tenantId || null
  if (isActive             !== undefined) data.isActive             = isActive

  const product = await prisma.product.update({
    where:   { id: params.id },
    data,
    include: { tenant: { select: { id: true, nome: true, slug: true } } },
  })

  return NextResponse.json({ product })
}

// ── DELETE /api/products/[id] ─────────────────────────────────────────────────
// Soft-delete: apenas seta isActive = false
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!isAdminMaster(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  const product = await prisma.product.update({
    where: { id: params.id },
    data:  { isActive: false },
  })

  return NextResponse.json({ success: true, product })
}
