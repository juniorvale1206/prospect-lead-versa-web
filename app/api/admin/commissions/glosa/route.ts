/**
 * POST /api/admin/commissions/glosa
 *
 * Aplica GLOSA em uma CommissionEntry (cancelamento de comissão).
 * GLOSA é aplicada quando o pedido é cancelado em até 7 dias da venda
 * ou quando há irregularidade detectada pelo financeiro.
 *
 * Body: {
 *   entryId?: string    — ID de entry específica (ou)
 *   orderId?: string    — ID de pedido (glosa todas as entries do pedido)
 *   reason: string      — Motivo da glosa (obrigatório)
 *   type?: 'CANCELAMENTO_7D' | 'IRREGULARIDADE' | 'DUPLICIDADE' | 'OUTROS'
 * }
 *
 * GET /api/admin/commissions/glosa?cycleId=xxx
 *   Lista todas as glosadas do ciclo
 *
 * RBAC: ADMIN_MASTER | FINANCIAL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

// ─── GET: Listar glosadas ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const cycleId = searchParams.get('cycleId') ?? undefined
    const tenantId = session.role === 'ADMIN_MASTER'
      ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
      : (session.tenantId ?? '')

    const entries = await prisma.commissionEntry.findMany({
      where: { tenantId, status: 'GLOSA', ...(cycleId ? { cycleId } : {}) },
      include: {
        user: { select: { id: true, nome: true } },
        order: { select: { id: true, orderNumber: true, clientName: true } },
        cycle: { select: { id: true, competencia: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const totalGlosado = entries.reduce((s, e) => s + e.amount, 0)

    return NextResponse.json({ entries, totalGlosado, count: entries.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── POST: Aplicar glosa ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const { entryId, orderId, reason, type = 'OUTROS' } = body

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json({ error: 'Motivo da glosa é obrigatório (mínimo 5 caracteres)' }, { status: 400 })
    }

    const GLOSA_TYPES: Record<string, string> = {
      CANCELAMENTO_7D: 'Cancelamento em 7 dias',
      IRREGULARIDADE: 'Irregularidade detectada',
      DUPLICIDADE: 'Pedido duplicado',
      OUTROS: 'Outros',
    }

    const glosaNotes = `GLOSA — ${GLOSA_TYPES[type] ?? type}: ${reason} | Aplicada por ${session.userId} em ${new Date().toLocaleDateString('pt-BR')}`

    if (entryId) {
      // Glosa de entry específica
      const entry = await prisma.commissionEntry.findUnique({ where: { id: entryId } })
      if (!entry) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })

      await prisma.commissionEntry.update({
        where: { id: entryId },
        data: { status: 'GLOSA', notes: glosaNotes },
      })

      return NextResponse.json({ success: true, glosedCount: 1, type, notes: glosaNotes })
    }

    if (orderId) {
      // Glosa de todas as entries do pedido
      const result = await prisma.commissionEntry.updateMany({
        where: { orderId, status: { notIn: ['PAID', 'GLOSA'] } },
        data: { status: 'GLOSA', notes: glosaNotes },
      })

      // Também atualiza o pedido
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() },
      }).catch(() => {})  // Ignorar se o pedido não existir/já cancelado

      return NextResponse.json({
        success: true,
        glosedCount: result.count,
        type,
        notes: glosaNotes,
        message: `${result.count} entrada(s) de comissão glosada(s)`,
      })
    }

    return NextResponse.json({ error: 'Forneça entryId ou orderId' }, { status: 400 })
  } catch (err: unknown) {
    console.error('[POST /api/admin/commissions/glosa]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
