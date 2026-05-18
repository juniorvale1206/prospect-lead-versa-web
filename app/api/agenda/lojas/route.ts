/**
 * GET /api/agenda/lojas?tenantId=xxx&date=YYYY-MM-DD
 *
 * Retorna lojas com disponibilidade para agendamento na data informada.
 * Rota pública (usada no checkout pelo cliente final).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId') ?? undefined
  const dateStr  = searchParams.get('date')

  // Buscar lojas ativas do tenant
  const where: Record<string, unknown> = { status: 'ACTIVE' }
  if (tenantId) where.tenantId = tenantId

  const stores = await prisma.partnerStore.findMany({
    where,
    select: {
      id: true, name: true, address: true, cidade: true, uf: true,
      storeType: true, category: true, ownerPhone: true,
      latitude: true, longitude: true,
      technicians: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, phone: true },
      },
      storeSlots: dateStr ? {
        where: {
          date:   { gte: new Date(dateStr + 'T00:00:00'), lte: new Date(dateStr + 'T23:59:59') },
          status: 'AVAILABLE',
        },
        select: { id: true, startTime: true, endTime: true, capacity: true, booked: true },
        orderBy: { startTime: 'asc' },
      } : { take: 0 },
    },
    orderBy: { name: 'asc' },
  })

  // Enriquecer com hasAvailability
  const enriched = stores.map((s) => ({
    ...s,
    hasAvailability: s.storeSlots.some((sl) => sl.booked < sl.capacity),
    availableSlots: s.storeSlots.filter((sl) => sl.booked < sl.capacity),
  }))

  return NextResponse.json({ stores: enriched, total: enriched.length })
}
