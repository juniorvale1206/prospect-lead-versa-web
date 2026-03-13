/**
 * GET /api/mobile/leaderboard/pdvs
 * ─────────────────────────────────────────────────────────────────────────────
 * Ranking de PDVs (PartnerStores) por leads captados no mês atual.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { getPdvLeaderboard }         from '@/lib/services/leaderboard.service'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    const tenantId = session.tenantId  // pode ser null para ADMIN_MASTER

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

    const ranking = await getPdvLeaderboard(tenantId, limit)

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
    console.error('[leaderboard/pdvs] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro interno ao carregar ranking de PDVs' },
      { status: 500 },
    )
  }
}
