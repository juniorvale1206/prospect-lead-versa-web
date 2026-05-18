/**
 * POST /api/admin/commissions/motor3
 *
 * Dispara o cálculo do Motor 3 (Carreira/Recorrência) para todos os promotores
 * de um ciclo específico. Pode ser executado manualmente pelo FINANCIAL/ADMIN
 * ou automaticamente durante o fechamento do ciclo.
 *
 * Body: {
 *   cycleId: string                 — Ciclo de competência
 *   overrideRevenue?: boolean        — Se true, busca MRR real do banco (padrão)
 *   promoterOverrides?: Array<{      — Override manual de placas/MRR por promotor
 *     userId: string
 *     activePlatesCount: number
 *     monthlyBaseRevenue: number
 *   }>
 * }
 *
 * GET /api/admin/commissions/motor3?cycleId=xxx
 *   Retorna resumo do Motor 3 para o ciclo (todos os promotores com carreira)
 *
 * RBAC: ADMIN_MASTER | FINANCIAL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  calculateMotor3,
  getCareerLevel,
  getCareerPercentage,
  VAPEC_POLICY,
} from '@/lib/services/commission-calculator.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

// ─── GET: Resumo Motor 3 do ciclo ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const cycleId = searchParams.get('cycleId')
    const tenantId = session.role === 'ADMIN_MASTER'
      ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
      : (session.tenantId ?? '')

    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    // Buscar entradas Motor 3 do ciclo
    const whereClause: Record<string, unknown> = { tenantId, motor: 'MOTOR3' }
    if (cycleId) whereClause.cycleId = cycleId

    const motor3Entries = await prisma.commissionEntry.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, nome: true, email: true } },
        cycle: { select: { id: true, competencia: true, status: true } },
      },
      orderBy: { amount: 'desc' },
    })

    // Agrupar por promotor com nível de carreira
    const byPromoter = new Map<string, {
      userId: string
      userName: string
      entries: typeof motor3Entries
      totalAmount: number
      careerLevel: ReturnType<typeof getCareerLevel>
      activePlates: number
      percentage: number
    }>()

    for (const entry of motor3Entries) {
      const user = (entry as any).user
      const existing = byPromoter.get(entry.userId)
      if (existing) {
        existing.entries.push(entry)
        existing.totalAmount += entry.amount
      } else {
        const level = getCareerLevel(entry.activePlates ?? 0)
        byPromoter.set(entry.userId, {
          userId: entry.userId,
          userName: user?.nome ?? entry.userId,
          entries: [entry],
          totalAmount: entry.amount,
          careerLevel: level,
          activePlates: entry.activePlates ?? 0,
          percentage: getCareerPercentage(level),
        })
      }
    }

    // Ranking por nível de carreira
    const careerRanking = Array.from(byPromoter.values()).sort((a, b) => {
      const levelOrder = { DIAMANTE: 4, OURO: 3, PRATA: 2, BRONZE: 1, null: 0 }
      const aLevel = a.careerLevel ?? null
      const bLevel = b.careerLevel ?? null
      return (levelOrder[bLevel as keyof typeof levelOrder] ?? 0) -
             (levelOrder[aLevel as keyof typeof levelOrder] ?? 0)
    })

    // Thresholds de carreira para UI
    const careerThresholds = [
      { level: 'BRONZE',   plates: VAPEC_POLICY.MOTOR3.BRONZE_THRESHOLD,   pct: VAPEC_POLICY.MOTOR3.BRONZE_PCT },
      { level: 'PRATA',    plates: VAPEC_POLICY.MOTOR3.PRATA_THRESHOLD,    pct: VAPEC_POLICY.MOTOR3.PRATA_PCT },
      { level: 'OURO',     plates: VAPEC_POLICY.MOTOR3.OURO_THRESHOLD,     pct: VAPEC_POLICY.MOTOR3.OURO_PCT },
      { level: 'DIAMANTE', plates: VAPEC_POLICY.MOTOR3.DIAMANTE_THRESHOLD, pct: VAPEC_POLICY.MOTOR3.DIAMANTE_PCT },
    ]

    return NextResponse.json({
      careerRanking,
      careerThresholds,
      totalMotor3: motor3Entries.reduce((s, e) => s + e.amount, 0),
      totalPromotersWithCareer: byPromoter.size,
    })
  } catch (err: unknown) {
    console.error('[GET /api/admin/commissions/motor3]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── POST: Calcular Motor 3 para ciclo ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const { cycleId, promoterOverrides } = body

    const tenantId = session.role === 'ADMIN_MASTER'
      ? (body.tenantId ?? session.tenantId ?? '')
      : (session.tenantId ?? '')

    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    if (!cycleId) return NextResponse.json({ error: 'cycleId é obrigatório' }, { status: 400 })

    // Verificar ciclo
    const cycle = await prisma.commissionCycle.findFirst({
      where: { id: cycleId, tenantId, status: { in: ['OPEN', 'CLOSING'] } },
    })
    if (!cycle) return NextResponse.json({ error: 'Ciclo não encontrado ou já fechado' }, { status: 404 })

    // Remover Motor 3 anteriores do ciclo (recalculo)
    await prisma.commissionEntry.deleteMany({
      where: { cycleId, tenantId, motor: 'MOTOR3' },
    })

    const results: Array<{
      userId: string
      careerLevel: string | null
      activePlates: number
      amount: number
      percentage: number
      skipped: boolean
      reason?: string
    }> = []

    if (promoterOverrides && Array.isArray(promoterOverrides) && promoterOverrides.length > 0) {
      // Modo override manual: promoter list com placas e MRR fornecidos
      for (const override of promoterOverrides) {
        const { userId, activePlatesCount, monthlyBaseRevenue } = override
        if (!userId || typeof activePlatesCount !== 'number' || typeof monthlyBaseRevenue !== 'number') {
          results.push({ userId: userId ?? '?', careerLevel: null, activePlates: 0, amount: 0, percentage: 0, skipped: true, reason: 'Dados inválidos' })
          continue
        }

        const motor3Result = await calculateMotor3({
          userId,
          tenantId,
          cycleId,
          activePlatesCount,
          monthlyBaseRevenue,
        })

        if (motor3Result) {
          results.push({
            userId,
            careerLevel: motor3Result.careerLevel ?? null,
            activePlates: motor3Result.activePlates ?? 0,
            amount: motor3Result.amount,
            percentage: motor3Result.percentage,
            skipped: false,
          })
        } else {
          results.push({
            userId,
            careerLevel: null,
            activePlates: activePlatesCount,
            amount: 0,
            percentage: 0,
            skipped: true,
            reason: `Abaixo de ${VAPEC_POLICY.MOTOR3.BRONZE_THRESHOLD} placas ativas`,
          })
        }
      }
    } else {
      // Modo automático: buscar promotores do tenant com pedidos ATIVOS
      // Contar placas ativas = pedidos ACTIVE do promotor
      const promoterStats = await prisma.order.groupBy({
        by: ['promoterId'],
        where: {
          tenantId,
          status: 'ACTIVE',
          promoterId: { not: null },
        },
        _count: { id: true },
        _sum: { netValue: true },
      })

      for (const stat of promoterStats) {
        if (!stat.promoterId) continue

        const activePlatesCount = stat._count.id
        // MRR = soma dos netValues dos pedidos ativos do promotor
        const monthlyBaseRevenue = stat._sum.netValue ?? 0

        const motor3Result = await calculateMotor3({
          userId: stat.promoterId,
          tenantId,
          cycleId,
          activePlatesCount,
          monthlyBaseRevenue,
        })

        if (motor3Result) {
          results.push({
            userId: stat.promoterId,
            careerLevel: motor3Result.careerLevel ?? null,
            activePlates: motor3Result.activePlates ?? 0,
            amount: motor3Result.amount,
            percentage: motor3Result.percentage,
            skipped: false,
          })
        } else {
          results.push({
            userId: stat.promoterId,
            careerLevel: null,
            activePlates: activePlatesCount,
            amount: 0,
            percentage: 0,
            skipped: true,
            reason: `${activePlatesCount} placas ativas — abaixo de ${VAPEC_POLICY.MOTOR3.BRONZE_THRESHOLD}`,
          })
        }
      }
    }

    const generated = results.filter((r) => !r.skipped)
    const totalMotor3 = generated.reduce((s, r) => s + r.amount, 0)

    return NextResponse.json({
      success: true,
      cycleId,
      competencia: cycle.competencia,
      totalMotor3,
      promotersEligible: generated.length,
      promotersSkipped: results.filter((r) => r.skipped).length,
      results,
    })
  } catch (err: unknown) {
    console.error('[POST /api/admin/commissions/motor3]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
