/**
 * GET /api/agenda/disponibilidade
 *
 * Retorna slots disponíveis de uma loja e/ou técnico em um intervalo de datas.
 *
 * Query params:
 *   storeId      — ID da loja (obrigatório se technicianId não informado)
 *   technicianId — ID do técnico (opcional, filtra por técnico específico)
 *   startDate    — Data início YYYY-MM-DD (obrigatório)
 *   endDate      — Data fim   YYYY-MM-DD  (opcional, default = startDate + 7 dias)
 *   tenantId     — Tenant (opcional, validação extra)
 *
 * Retorna:
 *   { days: [ { date, slots: [ { id, startTime, endTime, available, technicianId? } ] } ] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const storeId      = searchParams.get('storeId') ?? undefined
  const technicianId = searchParams.get('technicianId') ?? undefined
  const startDateStr = searchParams.get('startDate')
  const endDateStr   = searchParams.get('endDate')

  if (!storeId && !technicianId) {
    return NextResponse.json({ error: 'Informe storeId ou technicianId' }, { status: 400 })
  }
  if (!startDateStr) {
    return NextResponse.json({ error: 'startDate é obrigatório (YYYY-MM-DD)' }, { status: 400 })
  }

  const startDate = new Date(startDateStr + 'T00:00:00')
  const endDate   = endDateStr
    ? new Date(endDateStr + 'T23:59:59')
    : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)

  // ── Slots da loja ──────────────────────────────────────────────────────────
  const storeSlots = storeId
    ? await prisma.storeSlot.findMany({
        where: {
          storeId,
          date:   { gte: startDate, lte: endDate },
          status: { in: ['AVAILABLE', 'BOOKED'] },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      })
    : []

  // ── Slots do técnico ───────────────────────────────────────────────────────
  const techSlots = technicianId
    ? await prisma.technicianSlot.findMany({
        where: {
          technicianId,
          date:   { gte: startDate, lte: endDate },
          status: { in: ['AVAILABLE', 'BOOKED'] },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      })
    : []

  // ── Construir estrutura por dia ────────────────────────────────────────────
  const dayMap = new Map<string, {
    date: string
    storeSlots: typeof storeSlots
    techSlots: typeof techSlots
  }>()

  const toKey = (d: Date) => d.toISOString().split('T')[0]

  for (const sl of storeSlots) {
    const key = toKey(sl.date)
    if (!dayMap.has(key)) dayMap.set(key, { date: key, storeSlots: [], techSlots: [] })
    dayMap.get(key)!.storeSlots.push(sl)
  }
  for (const sl of techSlots) {
    const key = toKey(sl.date)
    if (!dayMap.has(key)) dayMap.set(key, { date: key, storeSlots: [], techSlots: [] })
    dayMap.get(key)!.techSlots.push(sl)
  }

  // ── Intersecção: slot disponível = livre na loja E no técnico (ou só loja) ─
  const days = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, storeSlots: ss, techSlots: ts }) => {
      let slots

      if (storeId && technicianId) {
        // Intersecção: horários livres em ambos
        slots = ss
          .filter((s) => s.booked < s.capacity && s.status === 'AVAILABLE')
          .filter((s) =>
            ts.some(
              (t) =>
                t.startTime === s.startTime &&
                t.endTime   === s.endTime    &&
                t.status    === 'AVAILABLE',
            ),
          )
          .map((s) => ({
            id:           s.id,
            startTime:    s.startTime,
            endTime:      s.endTime,
            available:    true,
            source:       'store+technician',
            technicianId: technicianId,
          }))
      } else if (storeId) {
        slots = ss.map((s) => ({
          id:        s.id,
          startTime: s.startTime,
          endTime:   s.endTime,
          available: s.status === 'AVAILABLE' && s.booked < s.capacity,
          remaining: s.capacity - s.booked,
          source:    'store',
        }))
      } else {
        slots = ts.map((t) => ({
          id:           t.id,
          startTime:    t.startTime,
          endTime:      t.endTime,
          available:    t.status === 'AVAILABLE',
          source:       'technician',
          technicianId: t.technicianId,
        }))
      }

      return { date, slots, hasAvailability: slots.some((s) => s.available) }
    })

  return NextResponse.json({ days, storeId, technicianId, startDate: startDateStr, endDate: toKey(endDate) })
}
