/**
 * GET  /api/admin/agenda/slots — Listar slots (loja ou técnico)
 * POST /api/admin/agenda/slots — Criar slots em lote
 *
 * Suporta criação em lote para uma semana inteira de uma vez.
 *
 * POST body para criação em lote:
 * {
 *   type:        "store" | "technician"
 *   targetId:    storeId ou technicianId
 *   dates:       ["2026-05-19", "2026-05-20", ...]
 *   timeSlots:   [{ startTime: "09:00", endTime: "10:00" }, ...]
 *   capacity:    1    (só para store slots)
 * }
 *
 * Ou criação simples de 1 slot:
 * {
 *   type, targetId, date, startTime, endTime, capacity?
 * }
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
  const type         = searchParams.get('type')         // "store" | "technician"
  const targetId     = searchParams.get('targetId')
  const startDateStr = searchParams.get('startDate')
  const endDateStr   = searchParams.get('endDate')

  if (!type || !targetId) {
    return NextResponse.json({ error: 'type e targetId são obrigatórios' }, { status: 400 })
  }

  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : new Date()
  const endDate   = endDateStr
    ? new Date(endDateStr + 'T23:59:59')
    : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  if (type === 'store') {
    const slots = await prisma.storeSlot.findMany({
      where: { storeId: targetId, date: { gte: startDate, lte: endDate }, tenantId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    return NextResponse.json({ slots, type: 'store', targetId })
  }

  if (type === 'technician') {
    const slots = await prisma.technicianSlot.findMany({
      where: { technicianId: targetId, date: { gte: startDate, lte: endDate }, tenantId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    return NextResponse.json({ slots, type: 'technician', targetId })
  }

  return NextResponse.json({ error: 'type inválido. Use "store" ou "technician"' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const tenantId = await resolveTenantId(session.role, session.tenantId ?? null)
  if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

  const body = await req.json()
  const { type, targetId, dates, date, timeSlots, startTime, endTime, capacity = 1 } = body

  if (!type || !targetId) {
    return NextResponse.json({ error: 'type e targetId são obrigatórios' }, { status: 400 })
  }

  // Normalizar datas e horários
  const allDates: string[]    = dates ?? (date ? [date] : [])
  const allTimes: { startTime: string; endTime: string }[] =
    timeSlots ?? (startTime && endTime ? [{ startTime, endTime }] : [])

  if (allDates.length === 0) return NextResponse.json({ error: 'Informe date ou dates[]' }, { status: 400 })
  if (allTimes.length === 0) return NextResponse.json({ error: 'Informe startTime+endTime ou timeSlots[]' }, { status: 400 })

  // Criar todos os slots em lote
  const created: unknown[] = []

  for (const d of allDates) {
    const dateObj = new Date(d + 'T00:00:00')

    for (const { startTime: st, endTime: et } of allTimes) {
      if (type === 'store') {
        // Verificar se já existe
        const existing = await prisma.storeSlot.findFirst({
          where: { storeId: targetId, date: dateObj, startTime: st, endTime: et },
        })
        if (!existing) {
          const slot = await prisma.storeSlot.create({
            data: { storeId: targetId, date: dateObj, startTime: st, endTime: et, capacity, tenantId },
          })
          created.push(slot)
        }
      } else if (type === 'technician') {
        const existing = await prisma.technicianSlot.findFirst({
          where: { technicianId: targetId, date: dateObj, startTime: st, endTime: et },
        })
        if (!existing) {
          const slot = await prisma.technicianSlot.create({
            data: { technicianId: targetId, date: dateObj, startTime: st, endTime: et, tenantId },
          })
          created.push(slot)
        }
      }
    }
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 })
}
