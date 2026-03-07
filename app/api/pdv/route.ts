/**
 * /api/pdv — CRUD de PDVs (Postos/Lojas Parceiras)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET  /api/pdv              → lista PDVs do tenant (com filtros)
 * POST /api/pdv              → cadastra novo PDV
 *
 * Parâmetros GET (query):
 *   ?managerPromoterId=xxx   → filtra por promotor-gerente
 *   ?status=ACTIVE           → filtra por status
 *   ?search=nome             → busca por nome/CNPJ
 *   ?page=1&limit=20         → paginação
 *
 * Body POST:
 *   {
 *     name:                        string (obrigatório)
 *     cnpj?:                       string
 *     address?:                    string
 *     cidade?:                     string
 *     uf?:                         string
 *     ownerName?:                  string
 *     ownerPhone?:                 string
 *     storeType?:                  "POSTO_COMBUSTIVEL" | "LOJA_VAREJO" | "OFICINA" | ...
 *     managerPromoterId?:          string (ID do promotor-gerente)
 *     customNetworkCommissionPct?: number (taxa customizada, sobrescreve tenant)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const STORE_TYPES = [
  'POSTO_COMBUSTIVEL',
  'LOJA_VAREJO',
  'OFICINA',
  'TRANSPORTADORA',
  'OUTROS',
] as const

// ─── Helper ───────────────────────────────────────────────────────────────────
function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/pdv ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  const sp                 = req.nextUrl.searchParams
  const managerPromoterId  = sp.get('managerPromoterId')
  const status             = sp.get('status')
  const search             = sp.get('search')
  const page               = Math.max(1, parseInt(sp.get('page') ?? '1'))
  const limit              = Math.min(100, parseInt(sp.get('limit') ?? '20'))
  const skip               = (page - 1) * limit

  // Apenas ADMIN_MASTER pode ver todos os PDVs; outros só do próprio tenant
  const tenantFilter = session.role === 'ADMIN_MASTER' && !session.tenantId
    ? {}
    : { tenantId: session.tenantId }

  const where = {
    ...tenantFilter,
    ...(managerPromoterId ? { managerPromoterId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { name:  { contains: search } },
        { cnpj:  { contains: search } },
        { cidade:{ contains: search } },
      ],
    } : {}),
  }

  const [stores, total] = await Promise.all([
    prisma.partnerStore.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id:                         true,
        name:                       true,
        cnpj:                       true,
        address:                    true,
        cidade:                     true,
        uf:                         true,
        ownerName:                  true,
        ownerPhone:                 true,
        storeType:                  true,
        status:                     true,
        totalLeads:                 true,
        totalSales:                 true,
        customNetworkCommissionPct: true,
        createdAt:                  true,
        managerPromoter: {
          select: { id: true, nome: true, email: true, telefone: true },
        },
      },
    }),
    prisma.partnerStore.count({ where }),
  ])

  return NextResponse.json({
    success: true,
    data:    stores,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  })
}

// ─── POST /api/pdv ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  // Apenas ADMIN_MASTER, MANAGER e PROMOTER podem cadastrar PDVs
  const ALLOWED = ['ADMIN_MASTER', 'MANAGER', 'PROMOTER']
  if (!ALLOWED.includes(session.role)) {
    return err('Sem permissão para cadastrar PDVs.', 403, 'FORBIDDEN')
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Body inválido.', 400, 'INVALID_BODY')
  }

  const {
    name,
    cnpj,
    address,
    cidade,
    uf,
    ownerName,
    ownerPhone,
    storeType                = 'POSTO_COMBUSTIVEL',
    managerPromoterId,
    customNetworkCommissionPct,
  } = body

  // Validações
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return err('O campo name é obrigatório (mínimo 2 caracteres).', 400, 'VALIDATION_ERROR')
  }
  if (!(STORE_TYPES as readonly string[]).includes(storeType as string)) {
    return err(`storeType inválido. Use: ${STORE_TYPES.join(' | ')}`, 400, 'VALIDATION_ERROR')
  }
  if (
    customNetworkCommissionPct !== undefined &&
    customNetworkCommissionPct !== null &&
    (typeof customNetworkCommissionPct !== 'number' ||
      customNetworkCommissionPct < 0 ||
      customNetworkCommissionPct > 100)
  ) {
    return err('customNetworkCommissionPct deve ser um número entre 0 e 100.', 400, 'VALIDATION_ERROR')
  }

  // Validar managerPromoterId se informado
  if (managerPromoterId && typeof managerPromoterId === 'string') {
    const manager = await prisma.user.findFirst({
      where: {
        id:   managerPromoterId,
        role: 'PROMOTER',
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
      select: { id: true },
    })
    if (!manager) {
      return err(
        'managerPromoterId não encontrado ou não é um PROMOTER do tenant.',
        404, 'NOT_FOUND',
      )
    }
  }

  // PROMOTER que cria o PDV automaticamente se torna o gerente se não informar outro
  const effectiveManagerId =
    (managerPromoterId as string | undefined) ??
    (session.role === 'PROMOTER' ? session.userId : undefined)

  const store = await prisma.partnerStore.create({
    data: {
      name:                       (name as string).trim(),
      cnpj:                       (cnpj as string | undefined)?.trim() ?? null,
      address:                    (address as string | undefined)?.trim() ?? null,
      cidade:                     (cidade as string | undefined)?.trim() ?? null,
      uf:                         (uf as string | undefined)?.toUpperCase() ?? null,
      ownerName:                  (ownerName as string | undefined)?.trim() ?? null,
      ownerPhone:                 (ownerPhone as string | undefined)?.trim() ?? null,
      storeType:                  storeType as string,
      managerPromoterId:          effectiveManagerId ?? null,
      customNetworkCommissionPct: customNetworkCommissionPct as number | null ?? null,
      tenantId:                   session.tenantId ?? null,
      status:                     'ACTIVE',
    },
    include: {
      managerPromoter: {
        select: { id: true, nome: true, email: true },
      },
    },
  })

  return NextResponse.json({ success: true, data: store }, { status: 201 })
}
