/**
 * GET  /api/mobile/agenda  — lista visitas do dia (SCHEDULED + IN_PROGRESS)
 * POST /api/mobile/agenda  — cria nova visita agendada
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ═══ GET ═══════════════════════════════════════════════════════════════════
 * Retorna visitas do dia do promotor logado.
 *
 * Response 200:
 * {
 *   success: true,
 *   date:    "2026-03-13",
 *   visits:  [ PdvVisit + pdv ]
 * }
 *
 * ═══ POST ══════════════════════════════════════════════════════════════════
 * Cria uma nova visita agendada.
 *
 * Request body:
 * {
 *   pdvId:             string    (obrigatório)
 *   scheduledDate:     string    ISO 8601 — ex: "2026-03-15T09:00:00.000Z"
 *   storeManagerName?: string    — nome do gerente / contato na loja
 *   address?:          string    — endereço customizado (herda do PDV se omitido)
 * }
 *
 * Response 201:
 * {
 *   success: true,
 *   message: "Visita agendada com sucesso",
 *   visit:   { id, status: "SCHEDULED", scheduledDate, storeManagerName,
 *              address, pdv: { id, name, cidade, uf, ... } }
 * }
 *
 * Erros comuns:
 *   400 — pdvId ausente / data inválida / PDV não encontrado
 *   401 — não autenticado
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { getTodayVisits, createVisit } from '@/lib/services/agenda.service'

// ─── GET /api/mobile/agenda ───────────────────────────────────────────────────

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

// ─── POST /api/mobile/agenda ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    let body: {
      pdvId?:            string
      scheduledDate?:    string
      storeManagerName?: string
      address?:          string
    } = {}

    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Corpo da requisição inválido (JSON esperado)' },
        { status: 400 },
      )
    }

    // ── Validações obrigatórias ───────────────────────────────────────────────
    if (!body.pdvId || typeof body.pdvId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Campo obrigatório ausente: pdvId' },
        { status: 400 },
      )
    }

    if (!body.scheduledDate || typeof body.scheduledDate !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Campo obrigatório ausente: scheduledDate (ISO 8601)' },
        { status: 400 },
      )
    }

    // ── Cria a visita ─────────────────────────────────────────────────────────
    const visit = await createVisit(session.userId, session.tenantId, {
      pdvId:            body.pdvId,
      scheduledDate:    body.scheduledDate,
      storeManagerName: body.storeManagerName,
      address:          body.address,
    })

    return NextResponse.json(
      { success: true, message: 'Visita agendada com sucesso', visit },
      { status: 201 },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao agendar visita'
    console.error('[agenda] POST error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
