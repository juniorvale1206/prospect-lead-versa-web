/**
 * GET    /api/admin/orders/[id]          — Buscar pedido por ID
 * PATCH  /api/admin/orders/[id]          — Atualizar etapa do wizard
 * DELETE /api/admin/orders/[id]          — Cancelar pedido
 *
 * Etapas do wizard via PATCH:
 *   step=client   → attachClient (dados do cliente + endereço)
 *   step=vehicle  → attachVehicle (veículo ou frota)
 *   step=plan     → attachPlan (produto/plano + valores)
 *   step=confirm  → confirmOrder (finalizar pedido)
 *   step=activate → activateOrder (marcar como ativo/instalado)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getOrderById,
  attachClient,
  attachVehicle,
  attachPlan,
  confirmOrder,
  activateOrder,
  cancelOrder,
} from '@/lib/services/order.service'
import { generateCommissionsForOrder } from '@/lib/services/commission-calculator.service'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const tenantId = session.tenantId ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    const order = await getOrderById(tenantId, params.id)

    // PROMOTER só pode ver seus próprios pedidos
    if (session.role === 'PROMOTER' && order.promoterId !== session.userId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    return NextResponse.json(order)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const tenantId = session.tenantId ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    const body = await req.json()
    const { step, ...data } = body

    let result

    switch (step) {
      case 'client':
        result = await attachClient(tenantId, params.id, data, session.userId)
        break

      case 'vehicle':
        result = await attachVehicle(tenantId, params.id, data, session.userId)
        break

      case 'plan':
        result = await attachPlan(tenantId, params.id, data, session.userId)
        break

      case 'confirm':
        result = await confirmOrder(tenantId, params.id, session.userId)
        // Gerar comissões automaticamente ao confirmar
        try {
          const commissions = await generateCommissionsForOrder(params.id, tenantId)
          return NextResponse.json({ ...result, commissionsGenerated: commissions.length })
        } catch (commErr) {
          // Comissão pode falhar sem bloquear o pedido
          console.error('[Commission generation error]', commErr)
          return NextResponse.json({ ...result, commissionsGenerated: 0, commissionError: String(commErr) })
        }

      case 'activate':
        // Apenas ADMIN_MASTER, FINANCIAL ou MANAGER podem ativar
        if (session.role === 'PROMOTER') {
          return NextResponse.json({ error: 'Sem permissão para ativar pedido' }, { status: 403 })
        }
        result = await activateOrder(tenantId, params.id, session.userId)
        break

      default:
        return NextResponse.json({ error: `Etapa inválida: ${step}` }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('[PATCH /api/admin/orders/[id]]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Apenas ADMIN_MASTER e FINANCIAL podem cancelar pedidos
    if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão para cancelar pedido' }, { status: 403 })
    }

    const tenantId = session.tenantId ?? ''
    const { reason } = await req.json()

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json({ error: 'Informe o motivo do cancelamento (mínimo 5 caracteres)' }, { status: 400 })
    }

    const result = await cancelOrder(tenantId, params.id, reason, session.userId)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
