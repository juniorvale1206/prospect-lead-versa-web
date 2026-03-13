/**
 * GET /api/mobile/leaderboard/promoters
 * ─────────────────────────────────────────────────────────────────────────────
 * Ranking de promotores por leads captados no mês atual.
 *
 * AUTENTICAÇÃO: Cookie JWT do app
 * ROLES PERMITIDAS: PROMOTER | MANAGER | ADMIN_MASTER | FINANCIAL
 *
 * ─── QUERY PARAMETERS ────────────────────────────────────────────────────────
 *   limit    int   Máximo de itens no ranking (default 20, max 50)
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getSession }                 from '@/lib/auth'
import { getPromoterLeaderboard }     from '@/lib/services/leaderboard.service'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    const tenantId = session.tenantId  // pode ser null para ADMIN_MASTER

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

    const ranking = await getPromoterLeaderboard(tenantId, limit)

    const now = new Date()
    const monthNames = [
      'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
    ]
    const period = {
      month: now.getMonth() + 1,
      year:  now.getFullYear(),
      label: `${monthNames[now.getMonth()]}/${now.getFullYear()}`,
    }

    return NextResponse.json({ success: true, period, ranking })
  } catch (err) {
    console.error('[leaderboard/promoters] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro interno ao carregar ranking de promotores' },
      { status: 500 },
    )
  }
}
