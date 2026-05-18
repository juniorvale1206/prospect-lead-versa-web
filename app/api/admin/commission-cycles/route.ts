/**
 * GET  /api/admin/commission-cycles  — Listar ciclos de competência
 * POST /api/admin/commission-cycles  — Criar ciclo manualmente (geralmente auto)
 *
 * RBAC: ADMIN_MASTER | FINANCIAL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreateActiveCycle } from '@/lib/services/commission-calculator.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const tenantId =
      session.role === 'ADMIN_MASTER'
        ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
        : (session.tenantId ?? '')

    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    const cycles = await prisma.commissionCycle.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { entries: true } },
      },
    })

    // Calcular totais por status para cada ciclo
    const enriched = await Promise.all(
      cycles.map(async (cycle) => {
        const statusCounts = await prisma.commissionEntry.groupBy({
          by: ['status'],
          where: { cycleId: cycle.id },
          _count: { id: true },
          _sum: { amount: true },
        })

        const byStatus = Object.fromEntries(
          statusCounts.map((s) => [s.status, { count: s._count.id, total: s._sum.amount ?? 0 }]),
        )

        return { ...cycle, byStatus }
      }),
    )

    return NextResponse.json({ cycles: enriched })
  } catch (err: unknown) {
    console.error('[GET /api/admin/commission-cycles]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const tenantId = session.tenantId ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    // Criar ou retornar ciclo ativo
    const cycle = await getOrCreateActiveCycle(tenantId)
    return NextResponse.json(cycle, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
