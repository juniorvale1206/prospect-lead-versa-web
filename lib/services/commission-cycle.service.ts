/**
 * commission-cycle.service.ts — Gestão de Ciclos de Competência VAPEC
 *
 * Ciclo VAPEC 2026 v1.4:
 *   - Competência: dia 26 do mês anterior → dia 25 do mês corrente
 *   - Corte financeiro: dia 15 do mês seguinte
 *   - Janela de recuperação: dias 12-15 (CLOSING)
 *   - Pagamento: 20º dia útil do mês seguinte
 */

import { prisma } from '@/lib/prisma'
import { getPromoterCommissionSummary } from './commission-calculator.service'

// ─── Listar ciclos ───────────────────────────────────────────────────────────

export async function listCycles(tenantId: string) {
  return prisma.commissionCycle.findMany({
    where: { tenantId },
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { entries: true } },
    },
  })
}

export async function getCycleById(tenantId: string, cycleId: string) {
  const cycle = await prisma.commissionCycle.findFirst({
    where: { id: cycleId, tenantId },
    include: {
      entries: {
        include: {
          user: { select: { id: true, nome: true, email: true } },
          order: { select: { id: true, orderNumber: true, clientName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!cycle) throw new Error('Ciclo não encontrado')
  return cycle
}

// ─── Iniciar fechamento (CLOSING) ────────────────────────────────────────────

/**
 * Coloca o ciclo em modo CLOSING (janela de recuperação: dias 12-15).
 * Durante o CLOSING, o financeiro pode corrigir pendências antes do fechamento final.
 */
export async function startCycleClosing(
  tenantId: string,
  cycleId: string,
  userId: string,
): Promise<void> {
  const cycle = await prisma.commissionCycle.findFirst({
    where: { id: cycleId, tenantId, status: 'OPEN' },
  })
  if (!cycle) throw new Error('Ciclo não encontrado ou não está OPEN')

  await prisma.commissionCycle.update({
    where: { id: cycleId },
    data: { status: 'CLOSING', closedById: userId },
  })
}

// ─── Fechar ciclo definitivamente (CLOSED) ────────────────────────────────────

/**
 * Fecha o ciclo definitivamente.
 * 1. Calcula totais (totalAmount, totalEntries, totalPromoters)
 * 2. Bloqueia entradas PENDING sem compliance (Motor 4)
 * 3. Muda status para CLOSED
 */
export async function closeCycle(
  tenantId: string,
  cycleId: string,
  notes: string,
  userId: string,
): Promise<{ totalAmount: number; totalEntries: number; totalPromoters: number }> {
  const cycle = await prisma.commissionCycle.findFirst({
    where: { id: cycleId, tenantId, status: { in: ['OPEN', 'CLOSING'] } },
  })
  if (!cycle) throw new Error('Ciclo não encontrado ou já fechado')

  // Calcular totais
  const entries = await prisma.commissionEntry.findMany({
    where: { cycleId, tenantId, status: { notIn: ['GLOSA', 'BLOCKED'] } },
  })

  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0)
  const totalEntries = entries.length
  const uniquePromoters = new Set(entries.map((e) => e.userId)).size

  // Auto-bloquear PENDING sem compliance completo após corte financeiro
  await prisma.commissionEntry.updateMany({
    where: {
      cycleId,
      status: 'PENDING',
      documentOk: false,
    },
    data: { status: 'BLOCKED', notes: 'Fechamento do ciclo: documentação pendente' },
  })

  await prisma.commissionCycle.update({
    where: { id: cycleId },
    data: {
      status: 'CLOSED',
      totalAmount,
      totalEntries,
      totalPromoters: uniquePromoters,
      closingNotes: notes,
      closedById: userId,
    },
  })

  return { totalAmount, totalEntries, totalPromoters: uniquePromoters }
}

// ─── Marcar como PAID ────────────────────────────────────────────────────────

/**
 * Marca o ciclo como PAID e todas as entradas VALIDATED como PAID.
 * BR: Pagamento no 20º dia útil do mês seguinte.
 */
export async function markCycleAsPaid(
  tenantId: string,
  cycleId: string,
  paymentDate: Date,
  userId: string,
): Promise<void> {
  const cycle = await prisma.commissionCycle.findFirst({
    where: { id: cycleId, tenantId, status: 'CLOSED' },
  })
  if (!cycle) throw new Error('Ciclo não encontrado ou não está CLOSED')

  // Marcar todas as entradas VALIDATED como PAID
  await prisma.commissionEntry.updateMany({
    where: { cycleId, status: 'VALIDATED' },
    data: { status: 'PAID' },
  })

  await prisma.commissionCycle.update({
    where: { id: cycleId },
    data: { status: 'PAID', paymentDate },
  })
}

// ─── Dashboard do ciclo ───────────────────────────────────────────────────────

export interface CycleDashboard {
  cycle: {
    id: string
    competencia: string
    startDate: Date
    endDate: Date
    financialCutoff: Date
    recoveryWindowStart: Date | null
    recoveryWindowEnd: Date | null
    paymentDate: Date | null
    status: string
    totalAmount: number
    totalEntries: number
    totalPromoters: number
    closingNotes: string | null
  }
  motorBreakdown: {
    MOTOR1: { total: number; count: number }
    MOTOR2: { total: number; count: number }
    MOTOR3: { total: number; count: number }
    MOTOR4_COMPLIANCE: { validated: number; blocked: number; pending: number }
  }
  promoterSummaries: Awaited<ReturnType<typeof getPromoterCommissionSummary>>
  statusBreakdown: Record<string, number>
}

export async function getCycleDashboard(
  tenantId: string,
  cycleId: string,
): Promise<CycleDashboard> {
  const cycle = await prisma.commissionCycle.findFirst({
    where: { id: cycleId, tenantId },
  })
  if (!cycle) throw new Error('Ciclo não encontrado')

  const [motorGroups, statusGroups, promoterSummaries] = await Promise.all([
    prisma.commissionEntry.groupBy({
      by: ['motor'],
      where: { cycleId, tenantId },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.commissionEntry.groupBy({
      by: ['status'],
      where: { cycleId, tenantId },
      _count: { id: true },
    }),
    getPromoterCommissionSummary(tenantId, cycleId),
  ])

  // Compliance (Motor 4 = critérios sobre as outras entradas)
  const [complianceValidated, complianceBlocked, compliancePending] = await Promise.all([
    prisma.commissionEntry.count({ where: { cycleId, status: 'VALIDATED' } }),
    prisma.commissionEntry.count({ where: { cycleId, status: 'BLOCKED' } }),
    prisma.commissionEntry.count({ where: { cycleId, status: 'PENDING' } }),
  ])

  const motorBreakdown = {
    MOTOR1: { total: 0, count: 0 },
    MOTOR2: { total: 0, count: 0 },
    MOTOR3: { total: 0, count: 0 },
    MOTOR4_COMPLIANCE: {
      validated: complianceValidated,
      blocked: complianceBlocked,
      pending: compliancePending,
    },
  }

  for (const group of motorGroups) {
    const motor = group.motor as keyof typeof motorBreakdown
    if (motor in motorBreakdown && motor !== 'MOTOR4_COMPLIANCE') {
      const target = motorBreakdown[motor as 'MOTOR1' | 'MOTOR2' | 'MOTOR3']
      target.total = group._sum.amount ?? 0
      target.count = group._count.id
    }
  }

  const statusBreakdown = Object.fromEntries(
    statusGroups.map((s) => [s.status, s._count.id]),
  )

  return {
    cycle: {
      id: cycle.id,
      competencia: cycle.competencia,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      financialCutoff: cycle.financialCutoff,
      recoveryWindowStart: cycle.recoveryWindowStart,
      recoveryWindowEnd: cycle.recoveryWindowEnd,
      paymentDate: cycle.paymentDate,
      status: cycle.status,
      totalAmount: cycle.totalAmount,
      totalEntries: cycle.totalEntries,
      totalPromoters: cycle.totalPromoters,
      closingNotes: cycle.closingNotes,
    },
    motorBreakdown,
    promoterSummaries,
    statusBreakdown,
  }
}

// ─── Escalada Motor 1: Ranking de vendas no ciclo ────────────────────────────

export interface Motor1Ranking {
  userId: string
  userName: string
  salesCount: number
  currentPercentage: number
  nextThreshold: number
  nextPercentage: number
}

export async function getMotor1Ranking(
  tenantId: string,
  cycleId: string,
): Promise<Motor1Ranking[]> {
  const { VAPEC_POLICY } = await import('./commission-calculator.service')

  const aquisicaoEntries = await prisma.commissionEntry.findMany({
    where: {
      tenantId,
      cycleId,
      motor: 'MOTOR1',
      parcelaType: 'AQUISICAO',
      status: { notIn: ['GLOSA', 'BLOCKED'] },
    },
    include: { user: { select: { id: true, nome: true } } },
  })

  // Agrupar por userId
  const byUser = new Map<string, { nome: string; count: number }>()
  for (const entry of aquisicaoEntries) {
    const existing = byUser.get(entry.userId)
    if (existing) {
      existing.count++
    } else {
      byUser.set(entry.userId, {
        nome: (entry as any).user?.nome ?? entry.userId,
        count: 1,
      })
    }
  }

  return Array.from(byUser.entries())
    .map(([userId, data]) => {
      const salesCount = data.count
      const step = VAPEC_POLICY.MOTOR1.ESCALATION_EVERY
      const base = VAPEC_POLICY.MOTOR1.BASE_PERCENTAGE
      const inc = VAPEC_POLICY.MOTOR1.ESCALATION_STEP
      const currentLevel = Math.floor(salesCount / step)
      const currentPct = Math.min(base + currentLevel * inc, VAPEC_POLICY.MOTOR1.MAX_PERCENTAGE)
      const nextThreshold = (currentLevel + 1) * step
      const nextPct = Math.min(base + (currentLevel + 1) * inc, VAPEC_POLICY.MOTOR1.MAX_PERCENTAGE)

      return {
        userId,
        userName: data.nome,
        salesCount,
        currentPercentage: currentPct,
        nextThreshold,
        nextPercentage: nextPct,
      }
    })
    .sort((a, b) => b.salesCount - a.salesCount)
}
