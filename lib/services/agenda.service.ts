/**
 * lib/services/agenda.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AgendaService — Gerenciamento de Visitas a PDV (Agenda do Promotor)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROTAS SERVIDAS:
 *   GET  /api/mobile/agenda           – visitas do dia (SCHEDULED + IN_PROGRESS)
 *   POST /api/mobile/agenda/:id/checkin   – inicia visita (IN_PROGRESS)
 *   POST /api/mobile/agenda/:id/checkout  – encerra visita (COMPLETED)
 *
 * CÁLCULO DE DURAÇÃO:
 *   durationMinutes = Math.round((checkOutAt - checkInAt) / 60_000)
 *   Ambos os timestamps em milliseconds (JS Date)
 *
 * VALIDAÇÕES:
 *   checkin  → visita deve estar SCHEDULED
 *   checkout → visita deve estar IN_PROGRESS; checkInAt deve existir
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Status constants (SQLite does not support enums — use string literals)
// ─────────────────────────────────────────────────────────────────────────────

const PdvVisitStatus = {
  SCHEDULED:   'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
  CANCELED:    'CANCELED',
} as const

type PdvVisitStatusType = typeof PdvVisitStatus[keyof typeof PdvVisitStatus]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckinPayload {
  checkInLocation?: string
}

export interface CheckoutPayload {
  visitNotes?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// getTodayVisits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna as visitas SCHEDULED ou IN_PROGRESS de hoje para o promotor logado.
 *
 * "Hoje" é calculado como 00:00:00 → 23:59:59 no horário UTC do servidor.
 */
export async function getTodayVisits(promotorId: string) {
  const now   = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))

  return prisma.pdvVisit.findMany({
    where: {
      promotorId,
      scheduledDate: { gte: start, lte: end },
      status: { in: [PdvVisitStatus.SCHEDULED, PdvVisitStatus.IN_PROGRESS] },
    },
    include: {
      pdv: {
        select: {
          id:               true,
          name:             true,
          cidade:           true,
          uf:               true,
          address:          true,
          storeType:        true,
          managerPromoter:  { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// doCheckin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Realiza o check-in em uma visita agendada.
 *
 * Regras:
 *  • A visita deve estar com status SCHEDULED
 *  • Só o promotor dono da visita pode fazer check-in
 *  • Atualiza: status → IN_PROGRESS, checkInAt → now()
 */
export async function doCheckin(visitId: string, promotorId: string, payload: CheckinPayload) {
  // Busca a visita com validação de posse
  const visit = await prisma.pdvVisit.findFirst({
    where: { id: visitId, promotorId },
  })

  if (!visit) {
    throw new Error('Visita não encontrada ou sem permissão')
  }

  if (visit.status !== PdvVisitStatus.SCHEDULED) {
    throw new Error(`Não é possível fazer check-in: status atual é ${visit.status}`)
  }

  return prisma.pdvVisit.update({
    where: { id: visitId },
    data: {
      status:         PdvVisitStatus.IN_PROGRESS,
      checkInAt:      new Date(),
      checkInLocation: payload.checkInLocation ?? null,
    },
    include: {
      pdv: { select: { id: true, name: true, cidade: true, uf: true } },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// doCheckout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Realiza o check-out de uma visita em andamento.
 *
 * Regras:
 *  • A visita deve estar com status IN_PROGRESS
 *  • Só o promotor dono da visita pode fazer check-out
 *  • Atualiza:
 *      status         → COMPLETED
 *      checkOutAt     → now()
 *      durationMinutes → Math.round((checkOutAt - checkInAt) / 60_000)
 *      visitNotes     → payload.visitNotes (opcional)
 *
 * Cálculo de duração:
 *   A diferença em ms entre checkOutAt e checkInAt é dividida por 60.000
 *   para obter os minutos e arredondada para o inteiro mais próximo.
 */
export async function doCheckout(visitId: string, promotorId: string, payload: CheckoutPayload) {
  const visit = await prisma.pdvVisit.findFirst({
    where: { id: visitId, promotorId },
  })

  if (!visit) {
    throw new Error('Visita não encontrada ou sem permissão')
  }

  if (visit.status !== PdvVisitStatus.IN_PROGRESS) {
    throw new Error(`Não é possível fazer check-out: status atual é ${visit.status}`)
  }

  if (!visit.checkInAt) {
    throw new Error('Check-in não registrado — impossível calcular duração')
  }

  const checkOutAt      = new Date()
  const diffMs          = checkOutAt.getTime() - visit.checkInAt.getTime()
  const durationMinutes = Math.round(diffMs / 60_000)

  return prisma.pdvVisit.update({
    where: { id: visitId },
    data: {
      status:          PdvVisitStatus.COMPLETED,
      checkOutAt,
      durationMinutes,
      visitNotes:      payload.visitNotes ?? null,
    },
    include: {
      pdv: { select: { id: true, name: true, cidade: true, uf: true } },
    },
  })
}
