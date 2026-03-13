/**
 * GET /api/mobile/agenda
 * ─────────────────────────────────────────────────────────────────────────────
 * Retorna visitas do dia para o promotor logado (SCHEDULED + IN_PROGRESS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { getTodayVisits }            from '@/lib/services/agenda.service'

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    const visits = await getTodayVisits(session.userId)
    const today  = new Date().toISOString().slice(0, 10)

    return NextResponse.json({ success: true, date: today, visits })
  } catch (err) {
    console.error('[agenda] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar agenda do dia' },
      { status: 500 },
    )
  }
}
