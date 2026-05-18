/**
 * POST /api/admin/commission-cycles/[id]/close
 *
 * Fecha o ciclo de competência VAPEC.
 *
 * Body:
 *   action: 'start_closing' | 'close' | 'pay'
 *   notes?: string
 *   paymentDate?: string (ISO date — apenas para action=pay)
 *
 * Fluxo:
 *   1. start_closing → OPEN → CLOSING (janela de recuperação 12-15)
 *   2. close         → CLOSING/OPEN → CLOSED (fechamento definitivo)
 *   3. pay           → CLOSED → PAID (20º dia útil)
 *
 * RBAC: ADMIN_MASTER | FINANCIAL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  startCycleClosing,
  closeCycle,
  markCycleAsPaid,
} from '@/lib/services/commission-cycle.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão — apenas FINANCIAL e ADMIN_MASTER' }, { status: 403 })
    }

    const tenantId = session.tenantId ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    const body = await req.json()
    const { action, notes, paymentDate } = body

    switch (action) {
      case 'start_closing':
        await startCycleClosing(tenantId, params.id, session.userId)
        return NextResponse.json({
          message: 'Ciclo entrou em janela de recuperação (CLOSING)',
          action,
        })

      case 'close': {
        if (!notes || notes.trim().length < 3) {
          return NextResponse.json({ error: 'Informe as observações do fechamento' }, { status: 400 })
        }
        const totals = await closeCycle(tenantId, params.id, notes, session.userId)
        return NextResponse.json({
          message: 'Ciclo fechado com sucesso',
          action,
          ...totals,
        })
      }

      case 'pay': {
        const date = paymentDate ? new Date(paymentDate) : new Date()
        await markCycleAsPaid(tenantId, params.id, date, session.userId)
        return NextResponse.json({
          message: 'Ciclo marcado como PAGO — comissões liquidadas',
          action,
          paymentDate: date.toISOString(),
        })
      }

      default:
        return NextResponse.json({
          error: `Ação inválida: ${action}. Use: start_closing | close | pay`,
        }, { status: 400 })
    }
  } catch (err: unknown) {
    console.error('[POST /api/admin/commission-cycles/[id]/close]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
