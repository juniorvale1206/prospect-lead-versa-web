/**
 * POST /api/mobile/agenda/:id/checkout
 * ─────────────────────────────────────────────────────────────────────────────
 * Encerra uma visita em andamento — calcula duração e marca como COMPLETED.
 *
 * Body: { visitNotes?: string }
 *
 * durationMinutes = Math.round((checkOutAt - checkInAt) / 60_000)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { doCheckout }                from '@/lib/services/agenda.service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    let body: { visitNotes?: string } = {}
    try { body = await req.json() } catch { /* empty body is ok */ }

    const visit = await doCheckout(params.id, session.userId, {
      visitNotes: body.visitNotes,
    })

    const duration = visit.durationMinutes ?? 0
    const message  = `Check-out realizado. Duração: ${duration} minuto${duration !== 1 ? 's' : ''}.`

    return NextResponse.json({ success: true, message, visit })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao realizar check-out'
    console.error('[agenda/checkout] POST error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
