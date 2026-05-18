/**
 * GET  /api/admin/agenda/tecnicos  — Listar técnicos do tenant
 * POST /api/admin/agenda/tecnicos  — Criar técnico
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function resolveTenantId(role: string, jwt: string | null) {
  if (role === 'ADMIN_MASTER' && !jwt) {
    const t = await prisma.tenant.findFirst({ where: { ativo: true }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    return t?.id ?? null
  }
  return jwt
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const tenantId = await resolveTenantId(session.role, session.tenantId ?? null)
  if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? undefined
  const status  = searchParams.get('status')  ?? undefined

  const where: Record<string, unknown> = { tenantId }
  if (storeId) where.storeId = storeId
  if (status)  where.status  = status

  const technicians = await prisma.technician.findMany({
    where,
    include: {
      store: { select: { id: true, name: true, cidade: true } },
      slots: {
        where: {
          date:   { gte: new Date() },
          status: 'AVAILABLE',
        },
        take: 10,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        select: { id: true, date: true, startTime: true, endTime: true, status: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ technicians, total: technicians.length })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const tenantId = await resolveTenantId(session.role, session.tenantId ?? null)
  if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

  const { name, phone, email, storeId, status } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })

  const technician = await prisma.technician.create({
    data: { name, phone, email, storeId: storeId ?? null, status: status ?? 'ACTIVE', tenantId },
  })

  return NextResponse.json(technician, { status: 201 })
}
