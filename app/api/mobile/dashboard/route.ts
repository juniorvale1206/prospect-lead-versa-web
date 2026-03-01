/**
 * GET /api/mobile/dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard de "Missões e Ganhos" para o app Flutter do promotor.
 *
 * Headers obrigatórios:
 *   Authorization: Bearer <mobile_jwt_token>
 *
 * Query params opcionais:
 *   date    String  — Data de referência no formato YYYY-MM-DD (default: hoje)
 *
 * Retorno 200:
 * {
 *   success: true,
 *   promotor: { id, nome, email, role, tenantId, tenantNome },
 *
 *   hoje: {
 *     data:          "2025-03-01",
 *     leadsTotal:    5,         // total de leads criados hoje
 *     leadsAprovados: 2,        // leads com status AUDITADO_APROVADO
 *     leadsPendentes: 2,        // leads com status PENDENTE_AUDITORIA
 *     leadsRejeitados: 1,       // leads com status AUDITADO_REJEITADO
 *
 *     ganhos: {
 *       bonusCaptura:    5.00,  // R$ 1,00 × leads_criados_hoje
 *       bonusAprovacao:  4.00,  // R$ 2,00 × leads_aprovados_hoje
 *       comissaoVendas:  0.00,  // 30% × vendas convertidas
 *       total:           9.00,  // soma de todos os ganhos do dia
 *     }
 *   },
 *
 *   acumulado: {
 *     leadsTotal:     42,
 *     leadsAprovados: 28,
 *     leadsRejeitados: 5,
 *     leadsPendentes:  9,
 *     ganhos: {
 *       bonusCaptura:    42.00,
 *       bonusAprovacao:  56.00,
 *       comissaoVendas: 345.00,
 *       total:          443.00,
 *     }
 *   },
 *
 *   missoes: [                  // missões gamificadas do dia
 *     { id, titulo, descricao, meta, progresso, concluida, recompensa, icone },
 *   ],
 *
 *   rankingPosicao: 3,          // posição no ranking do tenant (null se sozinho)
 *   ultimosLeads: [             // últimos 5 leads do promotor
 *     { id, nomeCliente, placa, leadType, status, funnelStage, createdAt }
 *   ]
 * }
 *
 * Erros:
 *   401  UNAUTHORIZED    — token ausente ou inválido
 *   500  INTERNAL_ERROR  — erro genérico
 */

import { NextRequest } from 'next/server'
import { prisma }      from '@/lib/prisma'
import { verifyMobileToken, mobileError, mobileOk } from '@/lib/mobile-auth'

/* ─── Constantes de comissionamento ─────────────────────────────────────────── */
const BONUS_CAPTURA    = 1.00   // R$ por lead criado (independente de auditoria)
const BONUS_APROVACAO  = 2.00   // R$ por lead com placa APROVADA
const COMISSAO_VENDA   = 0.30   // 30% sobre o commissionValue de leads CONVERTIDOS

/* ─── Helpers de intervalo de datas ─────────────────────────────────────────── */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}
function parseDate(str: string | null): Date {
  if (!str) return new Date()
  const d = new Date(str + 'T12:00:00') // meio-dia para evitar fuso
  return isNaN(d.getTime()) ? new Date() : d
}

/* ─── Calcular ganhos de um conjunto de leads ───────────────────────────────── */
function calcularGanhos(leads: Array<{
  status: string
  funnelStage: string
  commissionValue: number
}>) {
  let bonusCaptura   = 0
  let bonusAprovacao = 0
  let comissaoVendas = 0

  for (const l of leads) {
    // Bônus de captura: R$ 1,00 por lead criado
    bonusCaptura += BONUS_CAPTURA

    // Bônus de aprovação de foto: R$ 2,00 por lead aprovado
    if (l.status === 'AUDITADO_APROVADO') {
      bonusAprovacao += BONUS_APROVACAO
    }

    // Comissão de venda: 30% do commissionValue para leads convertidos
    if (l.funnelStage === 'CONVERTIDO') {
      comissaoVendas += l.commissionValue * COMISSAO_VENDA
    }
  }

  return {
    bonusCaptura:   Number(bonusCaptura.toFixed(2)),
    bonusAprovacao: Number(bonusAprovacao.toFixed(2)),
    comissaoVendas: Number(comissaoVendas.toFixed(2)),
    total:          Number((bonusCaptura + bonusAprovacao + comissaoVendas).toFixed(2)),
  }
}

/* ─── Montar missões gamificadas ─────────────────────────────────────────────── */
function montarMissoes(params: {
  leadsHoje:      number
  aprovadosHoje:  number
  leadsTotal:     number
}) {
  const { leadsHoje, aprovadosHoje, leadsTotal } = params

  return [
    {
      id:         'mission_daily_3',
      titulo:     'Capturador do Dia',
      descricao:  'Registre 3 leads hoje',
      icone:      '🎯',
      meta:       3,
      progresso:  Math.min(leadsHoje, 3),
      concluida:  leadsHoje >= 3,
      recompensa: 'R$ 3,00 (bônus acumulado)',
    },
    {
      id:         'mission_daily_5',
      titulo:     'Super Prospector',
      descricao:  'Registre 5 leads hoje',
      icone:      '🚀',
      meta:       5,
      progresso:  Math.min(leadsHoje, 5),
      concluida:  leadsHoje >= 5,
      recompensa: 'R$ 5,00 (bônus acumulado)',
    },
    {
      id:         'mission_photo_1',
      titulo:     'Foto Aprovada',
      descricao:  'Tenha 1 foto de placa aprovada hoje',
      icone:      '📸',
      meta:       1,
      progresso:  Math.min(aprovadosHoje, 1),
      concluida:  aprovadosHoje >= 1,
      recompensa: 'R$ 2,00 (bônus aprovação)',
    },
    {
      id:         'mission_lifetime_10',
      titulo:     'Veterano',
      descricao:  'Cadastre 10 leads no total',
      icone:      '⭐',
      meta:       10,
      progresso:  Math.min(leadsTotal, 10),
      concluida:  leadsTotal >= 10,
      recompensa: 'Badge Veterano desbloqueado',
    },
    {
      id:         'mission_lifetime_50',
      titulo:     'Elite Promotor',
      descricao:  'Cadastre 50 leads no total',
      icone:      '🏆',
      meta:       50,
      progresso:  Math.min(leadsTotal, 50),
      concluida:  leadsTotal >= 50,
      recompensa: 'Badge Elite + comissão extra 5%',
    },
  ]
}

export async function GET(req: NextRequest) {
  try {
    /* ── 1. Autenticação mobile ──────────────────────────────────────────── */
    const payload = await verifyMobileToken(req)
    if (!payload) {
      return mobileError(
        'Token inválido ou expirado. Faça login novamente.',
        'UNAUTHORIZED',
        401,
      )
    }

    /* ── 2. Parâmetro de data ────────────────────────────────────────────── */
    const { searchParams } = new URL(req.url)
    const refDate  = parseDate(searchParams.get('date'))
    const diaInicio = startOfDay(refDate)
    const diaFim    = endOfDay(refDate)
    const dataStr   = refDate.toISOString().split('T')[0]

    const promotorId = payload.sub

    /* ── 3. Buscar dados do usuário ─────────────────────────────────────── */
    const user = await prisma.user.findUnique({
      where:  { id: promotorId },
      select: { id: true, nome: true, email: true, role: true, tenantId: true, tenant: { select: { nome: true } } },
    })
    if (!user) {
      return mobileError('Usuário não encontrado.', 'USER_NOT_FOUND', 404)
    }

    /* ── 4. Leads de HOJE do promotor ───────────────────────────────────── */
    const leadsHoje = await prisma.lead.findMany({
      where: {
        promotorId,
        createdAt: { gte: diaInicio, lte: diaFim },
      },
      select: {
        id:             true,
        nomeCliente:    true,
        placa:          true,
        leadType:       true,
        status:         true,
        funnelStage:    true,
        commissionValue: true,
        createdAt:      true,
      },
    })

    /* ── 5. Todos os leads do promotor (acumulado) ──────────────────────── */
    const todosLeads = await prisma.lead.findMany({
      where: { promotorId },
      select: {
        id:             true,
        nomeCliente:    true,
        placa:          true,
        leadType:       true,
        status:         true,
        funnelStage:    true,
        commissionValue: true,
        createdAt:      true,
      },
      orderBy: { createdAt: 'desc' },
    })

    /* ── 6. Calcular métricas de HOJE ───────────────────────────────────── */
    const aprovadosHoje  = leadsHoje.filter(l => l.status === 'AUDITADO_APROVADO').length
    const pendentesHoje  = leadsHoje.filter(l => l.status === 'PENDENTE_AUDITORIA').length
    const rejeitadosHoje = leadsHoje.filter(l => l.status === 'AUDITADO_REJEITADO').length
    const ganhosHoje     = calcularGanhos(leadsHoje)

    /* ── 7. Calcular métricas ACUMULADAS ────────────────────────────────── */
    const aprovadosTotal  = todosLeads.filter(l => l.status === 'AUDITADO_APROVADO').length
    const pendentesTotal  = todosLeads.filter(l => l.status === 'PENDENTE_AUDITORIA').length
    const rejeitadosTotal = todosLeads.filter(l => l.status === 'AUDITADO_REJEITADO').length
    const ganhosTotal     = calcularGanhos(todosLeads)

    /* ── 8. Ranking no tenant ───────────────────────────────────────────── */
    let rankingPosicao: number | null = null
    if (user.tenantId) {
      // Contar leads de todos os promotores do mesmo tenant (mês atual)
      const inicioMes = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
      const fimMes    = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999)

      const rankingRaw = await prisma.lead.groupBy({
        by:     ['promotorId'],
        where:  {
          tenantId: user.tenantId,
          createdAt: { gte: inicioMes, lte: fimMes },
          promotorId: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      })

      const posicao = rankingRaw.findIndex(r => r.promotorId === promotorId)
      rankingPosicao = posicao >= 0 ? posicao + 1 : null
    }

    /* ── 9. Últimos 5 leads (histórico rápido) ──────────────────────────── */
    const ultimosLeads = todosLeads.slice(0, 5).map(l => ({
      id:          l.id,
      nomeCliente: l.nomeCliente,
      placa:       l.placa,
      leadType:    l.leadType,
      status:      l.status,
      funnelStage: l.funnelStage,
      createdAt:   l.createdAt,
    }))

    /* ── 10. Missões gamificadas ─────────────────────────────────────────── */
    const missoes = montarMissoes({
      leadsHoje:     leadsHoje.length,
      aprovadosHoje,
      leadsTotal:    todosLeads.length,
    })

    /* ── 11. Resposta final ─────────────────────────────────────────────── */
    return mobileOk({
      promotor: {
        id:         user.id,
        nome:       user.nome,
        email:      user.email,
        role:       user.role,
        tenantId:   user.tenantId   ?? null,
        tenantNome: user.tenant?.nome ?? null,
      },

      hoje: {
        data:            dataStr,
        leadsTotal:      leadsHoje.length,
        leadsAprovados:  aprovadosHoje,
        leadsPendentes:  pendentesHoje,
        leadsRejeitados: rejeitadosHoje,
        ganhos:          ganhosHoje,
      },

      acumulado: {
        leadsTotal:      todosLeads.length,
        leadsAprovados:  aprovadosTotal,
        leadsRejeitados: rejeitadosTotal,
        leadsPendentes:  pendentesTotal,
        ganhos:          ganhosTotal,
      },

      missoes,
      rankingPosicao,
      ultimosLeads,
    })

  } catch (err) {
    console.error('[mobile/dashboard] erro:', err)
    return mobileError(
      'Erro interno do servidor. Tente novamente em instantes.',
      'INTERNAL_ERROR',
      500,
    )
  }
}
