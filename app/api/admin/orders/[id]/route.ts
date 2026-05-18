/**
 * GET    /api/admin/orders/[id]   — Buscar pedido por ID
 * PATCH  /api/admin/orders/[id]   — Atualizar etapa do wizard
 * DELETE /api/admin/orders/[id]   — Cancelar pedido
 *
 * Etapas do wizard via PATCH:
 *   step=client   → attachClient  (dados do cliente + endereço)
 *   step=vehicle  → attachVehicle (veículo ou frota)
 *   step=plan     → attachPlan    (produto/plano + valores)
 *   step=confirm  → confirmOrder  (finalizar pedido)
 *   step=activate → activateOrder (marcar como ativo/instalado)
 *
 * ADMIN_MASTER pode ter tenantId: null no JWT.
 * Nesses casos, buscamos o tenant direto no pedido (por ID) ou no banco.
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
import { prisma } from '@/lib/prisma'

// ─── Helper: resolver tenantId para operações por ID ─────────────────────────
// Para ADMIN_MASTER com tenantId: null no JWT, busca o tenantId do próprio pedido.
// Isso garante que todas as operações usem o tenant correto sem precisar
// de parâmetro adicional no body.
async function resolveTenantIdForOrder(
  role: string,
  jwtTenantId: string | null,
  orderId: string,
): Promise<string | null> {
  if (role === 'ADMIN_MASTER') {
    if (jwtTenantId) return jwtTenantId

    // Busca o tenantId diretamente no pedido — nenhum filtro de tenant aqui
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tenantId: true },
    })
    return order?.tenantId ?? null
  }

  return jwtTenantId
}

// ─── Helper: resolver tenantId sem orderId (fallback geral) ──────────────────
async function resolveTenantIdFallback(
  role: string,
  jwtTenantId: string | null,
): Promise<string | null> {
  if (role === 'ADMIN_MASTER' && !jwtTenantId) {
    const first = await prisma.tenant.findFirst({
      where: { ativo: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    return first?.id ?? null
  }
  return jwtTenantId
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const tenantId = await resolveTenantIdForOrder(
      session.role,
      session.tenantId ?? null,
      params.id,
    )
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    }

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

// ─── PATCH — Wizard Steps ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const tenantId = await resolveTenantIdForOrder(
      session.role,
      session.tenantId ?? null,
      params.id,
    )
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    }

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
        // Aceita tanto { productId } (catálogo) quanto { planName, baseValue } (hardcoded VAPEC)
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
          return NextResponse.json({
            ...result,
            commissionsGenerated: 0,
            commissionError: String(commErr),
          })
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

// ─── DELETE — Cancelar Pedido ─────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Apenas ADMIN_MASTER, FINANCIAL e MANAGER podem cancelar
    if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão para cancelar pedido' }, { status: 403 })
    }

    const tenantId = await resolveTenantIdForOrder(
      session.role,
      session.tenantId ?? null,
      params.id,
    )
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    }

    const { reason } = await req.json()
    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'Informe o motivo do cancelamento (mínimo 5 caracteres)' },
        { status: 400 },
      )
    }

    const result = await cancelOrder(tenantId, params.id, reason, session.userId)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
