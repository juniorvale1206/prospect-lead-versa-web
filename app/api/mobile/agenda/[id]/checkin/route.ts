/**
 * POST /api/mobile/agenda/:id/checkin
 * ─────────────────────────────────────────────────────────────────────────────
 * Inicia uma visita agendada — registra chegada do promotor ao PDV.
 *
 * Body: { checkInLocation?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { doCheckin }                 from '@/lib/services/agenda.service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    let body: { checkInLocation?: string } = {}
    try { body = await req.json() } catch { /* empty body is ok */ }

    const visit = await doCheckin(params.id, session.userId, {
      checkInLocation: body.checkInLocation,
    })

    return NextResponse.json({
      success: true,
      message: 'Check-in realizado com sucesso',
      visit,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao realizar check-in'
    console.error('[agenda/checkin] POST error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
