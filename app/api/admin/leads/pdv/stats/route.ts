/**
 * GET /api/admin/leads/pdv/stats
 * ---------------------------------------------------------------------------
 * Analytics endpoint for PDV leads dashboard cards.
 * Roles: ADMIN_MASTER, FINANCIAL, MANAGER
 *
 * QUERY PARAMETERS:
 *   tenantId   string   (ADMIN_MASTER only) filter by specific tenant
 *   pdvId      string   filter by specific PDV
 *   months     int      look-back window in months for period stats (default: 1)
 *
 * RESPONSE 200:
 * {
 *   success: true,
 *   stats: {
 *     // Card 1 -- Leads no Mes
 *     totalLeadsMonth:     number,   // count in current month
 *     totalLeadsPrevMonth: number,   // count in previous month
 *     monthGrowthPct:      number,   // % growth vs prev month
 *
 *     // Card 2 -- Taxa de Conversao
 *     totalLeadsAllTime:   number,
 *     totalConverted:      number,
 *     conversionRate:      number,   // 0-100
 *
 *     // Card 3 -- Breakdown por Origem
 *     bySource: [
 *       { sourceType: "QR_CODE_PDV", label: "QR Code (Passivo)", count: 42, pct: 70 },
 *       { sourceType: "MANUAL_PDV",  label: "Cadastro Manual (Frentista)", count: 18, pct: 30 },
 *       ...
 *     ],
 *
 *     // Card 4 -- Top 3 PDVs Ranking
 *     topPdvs: [
 *       {
 *         rank: 1,
 *         pdvId: "cmmg...",
 *         pdvName: "Posto Ipiranga Centro",
 *         cidade: "Sao Paulo",
 *         uf: "SP",
 *         storeType: "POSTO_COMBUSTIVEL",
 *         leadsCount: 34,
 *         converted: 8,
 *         convRate: 24,
 *         promotorNome: "Jose Silva",
 *         promotorId: "cmmg..."
 *       },
 *       ...
 *     ],
 *
 *     // Sparkline -- daily trend last 30 days
 *     dailyTrend: [
 *       { date: "07/02", total: 3, qrCode: 2, manual: 1 },
 *       ...
 *     ]
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { getPdvLeadsStats }          from '@/lib/services/pdv-leads.service'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'] as const

function err(msg: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message: msg } }, { status })
}

// ---------------------------------------------------------------------------
// GET /api/admin/leads/pdv/stats
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Auth
  const session = await getSession()
  if (!session) return err('Nao autenticado.', 401, 'UNAUTHORIZED')
  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return err('Sem permissao para acessar estatisticas PDV.', 403, 'FORBIDDEN')
  }

  const sp = req.nextUrl.searchParams

  // Months look-back window (1 = current month only, 3 = last quarter, etc.)
  const monthsParam = parseInt(sp.get('months') ?? '1', 10)
  const months = isNaN(monthsParam) || monthsParam < 1 || monthsParam > 24
    ? 1
    : monthsParam

  // Tenant scope
  const tenantId = session.role === 'ADMIN_MASTER'
    ? (sp.get('tenantId') ?? null)
    : (session.tenantId ?? null)

  const pdvId = sp.get('pdvId') ?? undefined

  try {
    const stats = await getPdvLeadsStats({ tenantId, pdvId, months })

    return NextResponse.json({
      success: true,
      stats,
      meta: {
        generatedAt: new Date().toISOString(),
        filters: { tenantId, pdvId, months },
      },
    })
  } catch (e) {
    console.error('[GET /api/admin/leads/pdv/stats]', e)
    return err('Erro interno ao calcular estatisticas PDV.', 500, 'INTERNAL_ERROR')
  }
}
