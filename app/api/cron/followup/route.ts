/**
 * POST /api/cron/followup
 *
 * Endpoint que aciona o cron de follow-up automático.
 * Protegido por CRON_SECRET para evitar chamadas não autorizadas.
 *
 * Em produção (Vercel), configurar em vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/followup", "schedule": "0 9,14,18 * * 1-5" }]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { runFollowupCron } from '@/lib/services/followup-cron.service'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Verificar segredo do cron OU sessão de ADMIN_MASTER
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET || 'prospeclead-cron-2025'

  let authorized = false

  if (secret === cronSecret) {
    authorized = true
  } else {
    // Permitir chamada autenticada por ADMIN_MASTER
    const cookieToken = req.cookies.get('prospeclead-token')?.value
    if (cookieToken) {
      const session = await verifyToken(cookieToken)
      if (session?.role === 'ADMIN_MASTER') authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { tenantId?: string }
  const started = Date.now()

  const result = await runFollowupCron(body.tenantId)

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    ...result,
  })
}

// GET para o Vercel Cron (não recebe body)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET || 'prospeclead-cron-2025'

  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const result = await runFollowupCron()

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    ...result,
  })
}
