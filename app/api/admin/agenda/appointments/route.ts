/**
 * GET   /api/admin/agenda/appointments — Listar agendamentos
 * PATCH /api/admin/agenda/appointments — Atualizar status de um agendamento
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
  const status      = searchParams.get('status')      ?? undefined
  const storeId     = searchParams.get('storeId')     ?? undefined
  const techId      = searchParams.get('technicianId') ?? undefined
  const dateStr     = searchParams.get('date')        ?? undefined
  const startDate   = searchParams.get('startDate')   ?? undefined
  const endDate     = searchParams.get('endDate')     ?? undefined
  const page        = parseInt(searchParams.get('page')  ?? '1')
  const limit       = parseInt(searchParams.get('limit') ?? '50')
  const skip        = (page - 1) * limit

  const where: Record<string, unknown> = { tenantId }
  if (status)  where.status       = status
  if (storeId) where.storeId      = storeId
  if (techId)  where.technicianId = techId
  if (dateStr) {
    where.scheduledDate = {
      gte: new Date(dateStr + 'T00:00:00'),
      lte: new Date(dateStr + 'T23:59:59'),
    }
  } else if (startDate || endDate) {
    const dateRange: Record<string, Date> = {}
    if (startDate) dateRange.gte = new Date(startDate + 'T00:00:00')
    if (endDate)   dateRange.lte = new Date(endDate   + 'T23:59:59')
    where.scheduledDate = dateRange
  }

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ scheduledDate: 'asc' }, { startTime: 'asc' }],
      include: {
        order:      { select: { id: true, orderNumber: true, planName: true, netValue: true } },
        store:      { select: { id: true, name: true, cidade: true } },
        technician: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.appointment.count({ where }),
  ])

  return NextResponse.json({
    appointments,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const tenantId = await resolveTenantId(session.role, session.tenantId ?? null)
  if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

  const { id, status, technicianId, notes, cancelReason } = await req.json()
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const appt = await prisma.appointment.findFirst({ where: { id, tenantId } })
  if (!appt) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (status)      updateData.status      = status
  if (technicianId) updateData.technicianId = technicianId
  if (notes)       updateData.notes       = notes
  if (cancelReason) {
    updateData.cancelReason = cancelReason
    updateData.cancelledAt  = new Date()
    updateData.status       = 'CANCELLED'
  }
  if (status === 'COMPLETED') updateData.completedAt = new Date()
  if (status === 'CONFIRMED') updateData.confirmedAt = new Date()

  const updated = await prisma.appointment.update({ where: { id }, data: updateData })
  return NextResponse.json(updated)
}
