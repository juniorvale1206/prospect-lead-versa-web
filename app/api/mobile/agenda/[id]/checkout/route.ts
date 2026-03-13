/**
 * POST /api/mobile/agenda/:id/checkout
 * ─────────────────────────────────────────────────────────────────────────────
 * Encerra uma visita em andamento e salva o Checklist de Trade Marketing.
 *
 * ── Fluxo recomendado no app mobile ──────────────────────────────────────────
 *
 *  1. Promotor clica em "Finalizar Visita"
 *  2. App exibe formulário de checklist (fotos, merchandising, análise)
 *  3. App faz upload das fotos via POST /api/upload → recebe URLs
 *  4. App monta o payload com as URLs + demais dados
 *  5. App chama este endpoint com o payload completo
 *  6. Servidor calcula durationMinutes e persiste tudo atomicamente
 *
 * ── Request body (application/json) ──────────────────────────────────────────
 * {
 *   // Notas gerais (opcional)
 *   visitNotes?: string
 *
 *   // Evidências fotográficas — enviar URLs pré-uploadadas
 *   facadePhotoUrl?:  string   // ex: "https://cdn.example.com/visits/facade-xyz.jpg"
 *   counterPhotoUrl?: string   // ex: "https://cdn.example.com/visits/counter-xyz.jpg"
 *
 *   // Merchandising in-store
 *   visualMerchandisingOk?:   boolean   // default: false
 *   pdvExecutionMaterials?:   string    // ex: "Stoppers A4, Wobblers, Adesivo de Chão"
 *
 *   // Análise de performance
 *   performanceAnalysis?: string  // feedback do gerente / análise de vendas
 * }
 *
 * ── Response 200 ─────────────────────────────────────────────────────────────
 * {
 *   success: true,
 *   message: "Check-out realizado. Duração: 47 minutos.",
 *   checklistScore: {
 *     total:     5,     // total de itens do checklist
 *     completed: 4,     // itens preenchidos pelo promotor
 *     pct:       80     // % de completude
 *   },
 *   visit: {
 *     id, status: "COMPLETED",
 *     checkInAt, checkOutAt, durationMinutes,
 *     facadePhotoUrl, counterPhotoUrl,
 *     visualMerchandisingOk, pdvExecutionMaterials,
 *     performanceAnalysis, visitNotes,
 *     pdv: { id, name, cidade, uf, ... }
 *   }
 * }
 *
 * ── Erros ─────────────────────────────────────────────────────────────────────
 *   400 — visita não está IN_PROGRESS / check-in não registrado / sem permissão
 *   401 — não autenticado
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { doCheckout, CheckoutPayload } from '@/lib/services/agenda.service'

// ─── Calcula score de completude do checklist ─────────────────────────────────

function calcChecklistScore(payload: CheckoutPayload): {
  total: number
  completed: number
  pct: number
} {
  const items = [
    Boolean(payload.facadePhotoUrl),           // foto fachada
    Boolean(payload.counterPhotoUrl),           // foto balcão
    payload.visualMerchandisingOk === true,     // merchandising executado
    Boolean(payload.pdvExecutionMaterials),     // materiais aplicados
    Boolean(payload.performanceAnalysis),       // análise de performance
  ]

  const total     = items.length
  const completed = items.filter(Boolean).length
  const pct       = Math.round((completed / total) * 100)

  return { total, completed, pct }
}

// ─── POST /api/mobile/agenda/:id/checkout ────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: CheckoutPayload = {}
    try {
      body = await req.json()
    } catch {
      // body vazio é permitido — todos os campos do checklist são opcionais
    }

    // ── Executa checkout + persiste checklist TM ──────────────────────────────
    const visit = await doCheckout(params.id, session.userId, body)

    // ── Calcula score de completude do checklist ──────────────────────────────
    const checklistScore = calcChecklistScore(body)

    // ── Monta mensagem de resposta ────────────────────────────────────────────
    const duration = visit.durationMinutes ?? 0
    const durationMsg = duration > 0
      ? `Duração: ${duration} minuto${duration !== 1 ? 's' : ''}.`
      : 'Duração: menos de 1 minuto.'

    const scoreMsg = checklistScore.pct === 100
      ? 'Checklist completo ✓'
      : `Checklist ${checklistScore.pct}% preenchido (${checklistScore.completed}/${checklistScore.total} itens).`

    return NextResponse.json({
      success: true,
      message: `Check-out realizado. ${durationMsg} ${scoreMsg}`,
      checklistScore,
      visit,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao realizar check-out'
    console.error('[agenda/checkout] POST error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
