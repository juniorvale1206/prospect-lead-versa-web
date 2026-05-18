/**
 * GET  /api/admin/commissions  — Dashboard de comissões
 *
 * Query params:
 *   cycleId   — ID do ciclo (obrigatório)
 *   motor     — MOTOR1 | MOTOR2 | MOTOR3 (filtro opcional)
 *   status    — PENDING | VALIDATED | PAID | BLOCKED | GLOSA
 *   userId    — filtrar por promotor
 *   page      — paginação
 *   limit     — itens por página
 *   view      — dashboard | entries | ranking (default: dashboard)
 *
 * RBAC: ADMIN_MASTER | FINANCIAL | MANAGER
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCycleDashboard, getMotor1Ranking } from '@/lib/services/commission-cycle.service'
import { validateMotor4Compliance } from '@/lib/services/commission-calculator.service'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER']

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const cycleId = searchParams.get('cycleId')
    const motor = searchParams.get('motor') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const userId = searchParams.get('userId') ?? undefined
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')
    const view = searchParams.get('view') ?? 'dashboard'

    const tenantId =
      session.role === 'ADMIN_MASTER'
        ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
        : (session.tenantId ?? '')

    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    // === VIEW: Dashboard do ciclo ===
    if (view === 'dashboard') {
      if (!cycleId) {
        // Retornar ciclo ativo
        const activeCycle = await prisma.commissionCycle.findFirst({
          where: { tenantId, status: { in: ['OPEN', 'CLOSING'] } },
          orderBy: { startDate: 'desc' },
        })
        if (!activeCycle) {
          return NextResponse.json({
            message: 'Nenhum ciclo ativo encontrado',
            cycles: await prisma.commissionCycle.findMany({
              where: { tenantId },
              orderBy: { startDate: 'desc' },
              take: 12,
            }),
          })
        }
        const dashboard = await getCycleDashboard(tenantId, activeCycle.id)
        return NextResponse.json({ activeCycle: activeCycle.id, ...dashboard })
      }

      const dashboard = await getCycleDashboard(tenantId, cycleId)
      return NextResponse.json(dashboard)
    }

    // === VIEW: Ranking Motor 1 ===
    if (view === 'ranking') {
      if (!cycleId) return NextResponse.json({ error: 'cycleId é obrigatório para ranking' }, { status: 400 })
      const ranking = await getMotor1Ranking(tenantId, cycleId)
      return NextResponse.json({ ranking })
    }

    // === VIEW: Entradas individuais ===
    const skip = (page - 1) * limit
    const where: Record<string, unknown> = { tenantId }
    if (cycleId) where.cycleId = cycleId
    if (motor) where.motor = motor
    if (status) where.status = status
    if (userId) where.userId = userId

    const [entries, total] = await Promise.all([
      prisma.commissionEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nome: true, email: true } },
          order: { select: { id: true, orderNumber: true, clientName: true, planName: true } },
          cycle: { select: { id: true, competencia: true, status: true } },
        },
      }),
      prisma.commissionEntry.count({ where }),
    ])

    return NextResponse.json({
      items: entries,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
  } catch (err: unknown) {
    console.error('[GET /api/admin/commissions]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/commissions — Validar compliance (Motor 4)
 *
 * Body: {
 *   entryId: string,
 *   documentOk: boolean,
 *   contractOk: boolean,
 *   activationOk: boolean,
 *   financialOk: boolean
 * }
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Apenas FINANCIAL e ADMIN_MASTER podem validar compliance
    if (!['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) {
      return NextResponse.json({ error: 'Apenas o financeiro pode validar compliance' }, { status: 403 })
    }

    const body = await req.json()
    const { entryId, documentOk, contractOk, activationOk, financialOk } = body

    if (!entryId) return NextResponse.json({ error: 'entryId é obrigatório' }, { status: 400 })

    const result = await validateMotor4Compliance({
      entryId,
      documentOk: Boolean(documentOk),
      contractOk: Boolean(contractOk),
      activationOk: Boolean(activationOk),
      financialOk: Boolean(financialOk),
      userId: session.userId,
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
