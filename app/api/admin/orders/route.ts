/**
 * GET  /api/admin/orders  — Listar pedidos (com filtros, paginação)
 * POST /api/admin/orders  — Criar rascunho de pedido (Etapa 0 do Wizard)
 *
 * RBAC:
 *   ADMIN_MASTER → pode ver/criar em qualquer tenant
 *                  → quando tenantId é null no JWT, usa o primeiro tenant disponível
 *   FINANCIAL    → vê seu tenant
 *   MANAGER      → vê seu tenant
 *   PROMOTER     → vê apenas seus próprios pedidos
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listOrders, createOrderDraft, getOrderStats } from '@/lib/services/order.service'
import { prisma } from '@/lib/prisma'

// ─── Helper: resolver tenantId ────────────────────────────────────────────────
// ADMIN_MASTER pode ter tenantId: null no JWT.
// Nesse caso, usa o tenantId do query param ou busca o primeiro tenant do banco.
// Outros roles usam sempre o tenantId do próprio JWT.
async function resolveTenantId(
  role: string,
  jwtTenantId: string | null,
  queryTenantId?: string | null,
): Promise<string | null> {
  if (role === 'ADMIN_MASTER') {
    // Prioridade: query param > JWT > primeiro tenant do banco
    const candidate = queryTenantId ?? jwtTenantId
    if (candidate) return candidate

    // Último recurso: buscar o primeiro tenant ativo
    const first = await prisma.tenant.findFirst({
      where: { ativo: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    return first?.id ?? null
  }

  return jwtTenantId
}

// ─── GET — Listar / Stats ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page      = parseInt(searchParams.get('page')  ?? '1')
    const limit     = parseInt(searchParams.get('limit') ?? '20')
    const status    = searchParams.get('status')    ?? undefined
    const orderType = searchParams.get('orderType') ?? undefined
    const search    = searchParams.get('search')    ?? undefined
    const pdvId     = searchParams.get('pdvId')     ?? undefined
    const statsOnly = searchParams.get('stats') === 'true'

    // RBAC: promotor só vê seus próprios pedidos
    const promoterId =
      session.role === 'PROMOTER'
        ? session.userId
        : (searchParams.get('promoterId') ?? undefined)

    const tenantId = await resolveTenantId(
      session.role,
      session.tenantId ?? null,
      searchParams.get('tenantId'),
    )

    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum tenant disponível no sistema' }, { status: 400 })
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

// ─── POST — Criar Rascunho ────────────────────────────────────────────────────

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
    const { orderType, originType, pdvId, leadId, tenantId: bodyTenantId } = body

    // Resolve o tenantId — body pode sobrescrever para ADMIN_MASTER
    const tenantId = await resolveTenantId(
      session.role,
      session.tenantId ?? null,
      bodyTenantId ?? null,
    )

    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum tenant disponível. Crie um tenant primeiro.' }, { status: 400 })
    }

    // Obter o slug do tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })

    // Verifica se o userId da sessão existe como User no banco.
    // ADMIN_MASTER com userId de teste pode não ter registro — nesse caso promoterId fica null.
    const userExists = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    })

    const order = await createOrderDraft({
      orderType:   orderType   ?? 'B2C',
      originType:  originType  ?? 'PROMOTER',
      pdvId,
      leadId,
      tenantId,
      tenantSlug:  tenant?.slug ?? 'default',
      promoterId:  userExists ? session.userId : undefined,
    })

    return NextResponse.json(order, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/admin/orders]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
