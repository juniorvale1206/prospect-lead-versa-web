/**
 * /api/admin/commissions/compliance
 *
 * GET  — Lista todas as entradas do ciclo com status de compliance (Motor 4)
 *         agrupadas por promotor
 *
 * PATCH — Valida/rejeita compliance de uma CommissionEntry
 *   Body: {
 *     entryId: string
 *     documentOk: boolean
 *     contractOk: boolean
 *     activationOk: boolean
 *     financialOk: boolean
 *     notes?: string         — observação opcional (motivo de bloqueio, etc.)
 *   }
 *
 * POST — Valida TODAS as entradas PENDING de um promotor em bloco
 *   Body: {
 *     userId: string
 *     cycleId: string
 *     documentOk: boolean
 *     contractOk: boolean
 *     activationOk: boolean
 *     financialOk: boolean
 *   }
 *
 * RBAC: ADMIN_MASTER | FINANCIAL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

// ─── GET: Listar compliance por ciclo ────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão — apenas FINANCIAL e ADMIN' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const cycleId = searchParams.get('cycleId')
    const userId = searchParams.get('userId') ?? undefined
    const statusFilter = searchParams.get('status') ?? undefined

    const tenantId = session.role === 'ADMIN_MASTER'
      ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
      : (session.tenantId ?? '')

    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    if (!cycleId) return NextResponse.json({ error: 'cycleId é obrigatório' }, { status: 400 })

    const where: Record<string, unknown> = { tenantId, cycleId }
    if (userId) where.userId = userId
    if (statusFilter) where.status = statusFilter

    const entries = await prisma.commissionEntry.findMany({
      where,
      orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, nome: true, email: true } },
        order: { select: { id: true, orderNumber: true, clientName: true, planName: true, plate: true } },
      },
    })

    // Agrupar por promotor para UI
    const byPromoter = new Map<string, {
      userId: string
      userName: string
      userEmail: string
      entries: typeof entries
      pendingCount: number
      validatedCount: number
      blockedCount: number
      totalAmount: number
      complianceScore: number  // 0-100%
      allCompliant: boolean
    }>()

    for (const entry of entries) {
      const user = (entry as any).user
      const uid = entry.userId

      if (!byPromoter.has(uid)) {
        byPromoter.set(uid, {
          userId: uid,
          userName: user?.nome ?? uid,
          userEmail: user?.email ?? '',
          entries: [],
          pendingCount: 0,
          validatedCount: 0,
          blockedCount: 0,
          totalAmount: 0,
          complianceScore: 0,
          allCompliant: false,
        })
      }

      const promoter = byPromoter.get(uid)!
      promoter.entries.push(entry)
      promoter.totalAmount += entry.amount
      if (entry.status === 'PENDING') promoter.pendingCount++
      if (entry.status === 'VALIDATED') promoter.validatedCount++
      if (entry.status === 'BLOCKED') promoter.blockedCount++
    }

    // Calcular compliance score para cada promotor
    for (const [, promoter] of byPromoter) {
      const total = promoter.entries.length
      if (total > 0) {
        // Score = % de critérios OK
        const criteriaSum = promoter.entries.reduce((s, e) => {
          const ok = [e.documentOk, e.contractOk, e.activationOk, e.financialOk].filter(Boolean).length
          return s + ok
        }, 0)
        promoter.complianceScore = Math.round((criteriaSum / (total * 4)) * 100)
        promoter.allCompliant = promoter.validatedCount === total && total > 0
      }
    }

    const promoters = Array.from(byPromoter.values())
      .sort((a, b) => a.pendingCount - b.pendingCount || b.totalAmount - a.totalAmount)

    // Totais globais
    const totals = {
      pending: entries.filter((e) => e.status === 'PENDING').length,
      validated: entries.filter((e) => e.status === 'VALIDATED').length,
      blocked: entries.filter((e) => e.status === 'BLOCKED').length,
      paid: entries.filter((e) => e.status === 'PAID').length,
      glosa: entries.filter((e) => e.status === 'GLOSA').length,
      totalAmount: entries.filter((e) => !['GLOSA', 'BLOCKED'].includes(e.status))
        .reduce((s, e) => s + e.amount, 0),
    }

    return NextResponse.json({ promoters, totals })
  } catch (err: unknown) {
    console.error('[GET /api/admin/commissions/compliance]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── PATCH: Validar compliance de uma entry ──────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão — apenas FINANCIAL e ADMIN' }, { status: 403 })
    }

    const body = await req.json()
    const { entryId, documentOk, contractOk, activationOk, financialOk, notes } = body

    if (!entryId) return NextResponse.json({ error: 'entryId é obrigatório' }, { status: 400 })

    const entry = await prisma.commissionEntry.findUnique({ where: { id: entryId } })
    if (!entry) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })

    const missingItems: string[] = []
    if (!documentOk) missingItems.push('Documentação')
    if (!contractOk) missingItems.push('Contrato assinado')
    if (!activationOk) missingItems.push('Ativação confirmada')
    if (!financialOk) missingItems.push('Validação financeira')

    const newStatus = missingItems.length === 0 ? 'VALIDATED' : 'BLOCKED'
    const autoNotes = missingItems.length > 0
      ? `Pendências Motor 4: ${missingItems.join(', ')} — validado por ${session.userId}`
      : `Compliance OK — validado por ${session.userId} em ${new Date().toLocaleDateString('pt-BR')}`

    const updated = await prisma.commissionEntry.update({
      where: { id: entryId },
      data: {
        documentOk: Boolean(documentOk),
        contractOk: Boolean(contractOk),
        activationOk: Boolean(activationOk),
        financialOk: Boolean(financialOk),
        status: newStatus,
        notes: notes ?? autoNotes,
      },
    })

    return NextResponse.json({
      entryId,
      status: newStatus,
      missingItems,
      entry: updated,
    })
  } catch (err: unknown) {
    console.error('[PATCH /api/admin/commissions/compliance]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// ─── POST: Validar todas as entradas PENDING de um promotor em bloco ─────────
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const { userId, cycleId, documentOk, contractOk, activationOk, financialOk } = body

    if (!userId || !cycleId) {
      return NextResponse.json({ error: 'userId e cycleId são obrigatórios' }, { status: 400 })
    }

    const tenantId = session.role === 'ADMIN_MASTER'
      ? (body.tenantId ?? session.tenantId ?? '')
      : (session.tenantId ?? '')

    const missingItems: string[] = []
    if (!documentOk) missingItems.push('Documentação')
    if (!contractOk) missingItems.push('Contrato assinado')
    if (!activationOk) missingItems.push('Ativação confirmada')
    if (!financialOk) missingItems.push('Validação financeira')

    const newStatus = missingItems.length === 0 ? 'VALIDATED' : 'BLOCKED'
    const autoNotes = missingItems.length > 0
      ? `Pendências Motor 4: ${missingItems.join(', ')}`
      : `Compliance validado em bloco por ${session.userId} em ${new Date().toLocaleDateString('pt-BR')}`

    const updated = await prisma.commissionEntry.updateMany({
      where: { userId, cycleId, tenantId, status: 'PENDING' },
      data: {
        documentOk: Boolean(documentOk),
        contractOk: Boolean(contractOk),
        activationOk: Boolean(activationOk),
        financialOk: Boolean(financialOk),
        status: newStatus,
        notes: autoNotes,
      },
    })

    return NextResponse.json({
      success: true,
      updatedCount: updated.count,
      status: newStatus,
      missingItems,
      message: newStatus === 'VALIDATED'
        ? `${updated.count} entradas validadas com sucesso`
        : `${updated.count} entradas bloqueadas — pendências: ${missingItems.join(', ')}`,
    })
  } catch (err: unknown) {
    console.error('[POST /api/admin/commissions/compliance]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
