/**
 * GET /api/admin/leads/pdv
 * ---------------------------------------------------------------------------
 * Paginated listing of leads from the PDV partner network.
 * Roles: ADMIN_MASTER, FINANCIAL, MANAGER
 *
 * QUERY PARAMETERS:
 *   page         int      default 1
 *   limit        int      default 20, max 100
 *   sourceType   string   QR_CODE_PDV | MANUAL_PDV | PDV | ALL (default: ALL pdv types)
 *   funnelStage  string   LEAD_COLETADO | IA_EM_ATENDIMENTO | REUNIAO_AGENDADA | CONVERTIDO
 *   status       string   PENDENTE_AUDITORIA | AUDITADO_APROVADO | AUDITADO_REJEITADO
 *   leadType     string   B2C | B2B
 *   pdvId        string   filter by specific PDV
 *   promotorId   string   filter by specific promotor-manager
 *   dateFrom     ISO8601  createdAt >= dateFrom
 *   dateTo       ISO8601  createdAt <= dateTo
 *   search       string   customer name, phone or plate
 *   orderBy      string   createdAt | nomeCliente | funnelStage (default: createdAt)
 *   orderDir     string   asc | desc (default: desc)
 *
 * RESPONSE 200:
 * {
 *   success: true,
 *   data: [
 *     {
 *       id, nomeCliente, telefone, email, veiculo, placa,
 *       leadType, sourceType, sourceLabel, funnelStage,
 *       iaStatus, status, createdAt,
 *       pdv: { id, name, cidade, uf, storeType, totalLeads, totalSales },
 *       promotor: { id, nome, email, role }
 *     }, ...
 *   ],
 *   pagination: { total, page, limit, pages }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import {
  listPdvLeads,
  PDV_SOURCE_TYPES,
  type PdvSourceType,
} from '@/lib/services/pdv-leads.service'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'] as const

function err(msg: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message: msg } }, { status })
}

// ---------------------------------------------------------------------------
// GET /api/admin/leads/pdv
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Auth
  const session = await getSession()
  if (!session) return err('Nao autenticado.', 401, 'UNAUTHORIZED')
  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return err('Sem permissao para acessar leads PDV.', 403, 'FORBIDDEN')
  }

  const sp = req.nextUrl.searchParams

  // Pagination
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1',   10))
  const limit = Math.min(100, parseInt(sp.get('limit') ?? '20', 10))

  // Source type filter
  const sourceTypeParam = sp.get('sourceType')
  const sourceTypes: PdvSourceType[] = (sourceTypeParam && sourceTypeParam !== 'ALL')
    ? (PDV_SOURCE_TYPES as readonly string[]).includes(sourceTypeParam)
      ? [sourceTypeParam as PdvSourceType]
      : [...PDV_SOURCE_TYPES]
    : [...PDV_SOURCE_TYPES]

  // Date range
  let dateFrom: Date | undefined
  let dateTo:   Date | undefined
  const dfParam = sp.get('dateFrom')
  const dtParam = sp.get('dateTo')
  if (dfParam) { const d = new Date(dfParam); if (!isNaN(d.getTime())) dateFrom = d }
  if (dtParam) { const d = new Date(dtParam); if (!isNaN(d.getTime())) { d.setHours(23,59,59,999); dateTo = d } }

  // Order
  const validOrderFields = ['createdAt', 'nomeCliente', 'funnelStage'] as const
  const orderByParam = sp.get('orderBy') ?? 'createdAt'
  const orderBy = (validOrderFields as readonly string[]).includes(orderByParam)
    ? orderByParam as typeof validOrderFields[number]
    : 'createdAt'
  const orderDir = sp.get('orderDir') === 'asc' ? 'asc' : 'desc'

  // Tenant scope: ADMIN_MASTER sees all; others see only their tenant
  const tenantId = session.role === 'ADMIN_MASTER'
    ? (sp.get('tenantId') ?? null)
    : (session.tenantId ?? null)

  try {
    const result = await listPdvLeads({
      tenantId,
      sourceTypes,
      pdvId:       sp.get('pdvId')       ?? undefined,
      promotorId:  sp.get('promotorId')  ?? undefined,
      funnelStage: sp.get('funnelStage') ?? undefined,
      status:      sp.get('status')      ?? undefined,
      leadType:    sp.get('leadType')    ?? undefined,
      search:      sp.get('search')      ?? undefined,
      dateFrom,
      dateTo,
      page,
      limit,
      orderBy,
      orderDir,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('[GET /api/admin/leads/pdv]', e)
    return err('Erro interno ao buscar leads PDV.', 500, 'INTERNAL_ERROR')
  }
}
