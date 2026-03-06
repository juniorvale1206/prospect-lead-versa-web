/**
 * POST/GET /api/cron/promoter-activity
 *
 * Endpoint HTTP que aciona o PromoterActivityMonitorService.
 * Deve ser chamado a cada 15 minutos para monitorar promotores inativos.
 *
 * Proteção:
 *   - Via query param ?secret=<CRON_SECRET>  (Vercel Cron, curl, etc.)
 *   - Via sessão autenticada com role ADMIN_MASTER
 *
 * Configurar no vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/promoter-activity",
 *       "schedule": "0,15,30,45 * * * *"
 *     }
 *   ]
 * }
 *
 * Variáveis de ambiente necessárias:
 *   CRON_SECRET       — segredo de proteção (padrão: prospeclead-cron-2025)
 *   OPENAI_API_KEY    — para geração da mensagem motivacional
 *
 * Teste manual:
 *   curl -X POST "http://localhost:3000/api/cron/promoter-activity?secret=prospeclead-cron-2025"
 *   curl "http://localhost:3000/api/cron/promoter-activity?secret=prospeclead-cron-2025"
 */

import { NextRequest, NextResponse } from 'next/server'
import { runPromoterActivityMonitor } from '@/lib/services/promoter-activity-monitor.service'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1. Via secret no query param
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET || 'prospeclead-cron-2025'

  if (secret === cronSecret) return true

  // 2. Via Authorization header (Bearer token)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === cronSecret) return true
  }

  // 3. Via sessão de cookie (ADMIN_MASTER)
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (cookieToken) {
    const session = await verifyToken(cookieToken)
    if (session?.role === 'ADMIN_MASTER') return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Chamada manual ou por Vercel Cron (com body)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Permite filtrar por tenant específico (útil para testes)
  const body = await req.json().catch(() => ({})) as { tenantId?: string }

  const started = Date.now()

  try {
    const result = await runPromoterActivityMonitor(body.tenantId)

    return NextResponse.json({
      ok: true,
      message: `Monitor executado: ${result.totalPaused} promotor(es) pausado(s) por inatividade`,
      ...result,
    })
  } catch (err) {
    console.error('[Cron/PromoterActivity] Erro fatal:', err)
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message,
        durationMs: Date.now() - started,
      },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Vercel Cron (sem body)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()

  try {
    const result = await runPromoterActivityMonitor()

    return NextResponse.json({
      ok: true,
      message: `Monitor executado: ${result.totalPaused} promotor(es) pausado(s) por inatividade`,
      ...result,
    })
  } catch (err) {
    console.error('[Cron/PromoterActivity] Erro fatal:', err)
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message,
        durationMs: Date.now() - started,
      },
      { status: 500 }
    )
  }
}
