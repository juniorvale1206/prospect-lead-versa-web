/**
 * GET  /api/admin/orders  — Listar pedidos (com filtros, paginação)
 * POST /api/admin/orders  — Criar rascunho de pedido (Etapa 0 do Wizard)
 *
 * RBAC:
 *   ADMIN_MASTER → vê todos os tenants
 *   FINANCIAL    → vê seu tenant
 *   MANAGER      → vê seu tenant
 *   PROMOTER     → vê apenas seus próprios pedidos
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listOrders, createOrderDraft, getOrderStats } from '@/lib/services/order.service'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')
    const status = searchParams.get('status') ?? undefined
    const orderType = searchParams.get('orderType') ?? undefined
    const search = searchParams.get('search') ?? undefined
    const pdvId = searchParams.get('pdvId') ?? undefined
    const statsOnly = searchParams.get('stats') === 'true'

    // RBAC: promotor só vê seus próprios pedidos
    const promoterId =
      session.role === 'PROMOTER'
        ? session.userId
        : (searchParams.get('promoterId') ?? undefined)

    // ADMIN_MASTER pode ver todos os tenants ou filtrar por tenantId
    const tenantId =
      session.role === 'ADMIN_MASTER'
        ? (searchParams.get('tenantId') ?? session.tenantId ?? '')
        : (session.tenantId ?? '')

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })
    }

    if (statsOnly) {
      const stats = await getOrderStats(tenantId)
      return NextResponse.json({ stats })
    }

    const result = await listOrders({
      tenantId,
      status,
      orderType,
      promoterId,
      pdvId,
      page,
      limit,
      search,
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('[GET /api/admin/orders]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Apenas roles que podem criar pedidos
    const ALLOWED = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER', 'PROMOTER']
    if (!ALLOWED.includes(session.role)) {
      return NextResponse.json({ error: 'Sem permissão para criar pedidos' }, { status: 403 })
    }

    const body = await req.json()
    const { orderType, originType, pdvId, leadId } = body

    const tenantId = session.tenantId ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 })

    // Obter o slug do tenant
    const { prisma } = await import('@/lib/prisma')
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })

    const order = await createOrderDraft({
      orderType: orderType ?? 'B2C',
      originType: originType ?? 'PROMOTER',
      pdvId,
      leadId,
      tenantId,
      tenantSlug: tenant?.slug ?? 'default',
      promoterId: session.userId,
    })

    return NextResponse.json(order, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/admin/orders]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
