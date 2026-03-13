/**
 * lib/services/leaderboard.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * LeaderboardService — Rankings para o app mobile do promotor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROTAS SERVIDAS:
 *   GET /api/mobile/leaderboard/promoters
 *   GET /api/mobile/leaderboard/pdvs
 *
 * ESTRATÉGIA DE AGGREGATION:
 *   • groupBy no modelo Lead filtrando pelo período (start/end do mês atual)
 *   • JOIN enriquecido via findMany posterior (evita rawQuery)
 *   • Ordenação descendente por total de leads
 *   • Comissões calculadas via SUM no CommissionLedger (status PAID + PENDING)
 *
 * CAMPOS RETORNADOS:
 *   Promotores: rank, id, nome, email, avatar, totalLeads, totalCommissions
 *   PDVs: rank, id, nome, cidade, uf, totalLeads, managerPromoterId, managerName
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna o início e o fim do mês atual no horário UTC. */
function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

// ─────────────────────────────────────────────────────────────────────────────
// Promoter Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export interface PromoterRankItem {
  rank:              number
  id:                string
  nome:              string
  email:             string
  avatarUrl:         string | null
  totalLeads:        number
  totalCommissions:  number   // R$ somados do CommissionLedger
}

/**
 * Retorna o ranking de promotores por leads captados no mês atual.
 *
 * @param tenantId   – Filtro de tenant (obrigatório para multi-tenant)
 * @param limit      – Máximo de itens (default 20)
 */
export async function getPromoterLeaderboard(
  tenantId: string | null,
  limit = 20,
): Promise<PromoterRankItem[]> {
  const { start, end } = currentMonthRange()

  // tenantId null = ADMIN_MASTER sem tenant → sem filtro de tenant
  const tenantFilter = tenantId ? { tenantId } : {}

  // 1. Agrupa leads por promotorId para o mês atual
  const grouped = await prisma.lead.groupBy({
    by: ['promotorId'],
    where: {
      ...tenantFilter,
      promotorId: { not: null },
      createdAt: { gte: start, lte: end },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  })

  if (grouped.length === 0) return []

  const promotorIds = grouped
    .map((g) => g.promotorId)
    .filter((id): id is string => Boolean(id))

  // 2. Busca dados dos promotores em batch
  const [users, commissions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: promotorIds }, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, nome: true, email: true, avatarUrl: true },
    }),
    // 3. Soma comissões do mês atual para esses promotores
    prisma.commissionLedger.groupBy({
      by: ['promotorId'],
      where: {
        promotorId: { in: promotorIds },
        ...(tenantId ? { tenantId } : {}),
        createdAt: { gte: start, lte: end },
        status: { in: ['PAID', 'PENDING'] },
      },
      _sum: { amount: true },
    }),
  ])

  // Lookups rápidos por ID
  const userMap = new Map(users.map((u) => [u.id, u]))
  const commMap = new Map(commissions.map((c) => [c.promotorId, c._sum.amount ?? 0]))

  // 4. Monta ranking com posição
  return grouped.map((g, idx) => {
    const pid  = g.promotorId as string
    const user = userMap.get(pid)

    return {
      rank:             idx + 1,
      id:               pid,
      nome:             user?.nome ?? 'Promotor',
      email:            user?.email ?? '',
      avatarUrl:        user?.avatarUrl ?? null,
      totalLeads:       g._count.id,
      totalCommissions: commMap.get(pid) ?? 0,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PDV Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export interface PdvRankItem {
  rank:               number
  id:                 string
  nome:               string
  cidade:             string
  uf:                 string
  totalLeads:         number
  managerPromoterId:  string | null
  managerName:        string | null
}

/**
 * Retorna o ranking de PDVs por leads captados no mês atual.
 *
 * @param tenantId   – Filtro de tenant
 * @param limit      – Máximo de itens (default 20)
 */
export async function getPdvLeaderboard(
  tenantId: string | null,
  limit = 20,
): Promise<PdvRankItem[]> {
  const { start, end } = currentMonthRange()

  const tenantFilter = tenantId ? { tenantId } : {}

  // 1. Agrupa leads por pdvId para o mês atual
  const grouped = await prisma.lead.groupBy({
    by: ['pdvId'],
    where: {
      ...tenantFilter,
      pdvId: { not: null },
      createdAt: { gte: start, lte: end },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  })

  if (grouped.length === 0) return []

  const pdvIds = grouped
    .map((g) => g.pdvId)
    .filter((id): id is string => Boolean(id))

  // 2. Busca dados dos PDVs com o managerPromoter em batch
  const stores = await prisma.partnerStore.findMany({
    where: { id: { in: pdvIds }, ...(tenantId ? { tenantId } : {}) },
    select: {
      id:   true,
      name: true,
      cidade: true,
      uf:   true,
      managerPromoterId: true,
      managerPromoter: {
        select: { id: true, nome: true },
      },
    },
  })

  const storeMap = new Map(stores.map((s) => [s.id, s]))

  // 3. Monta ranking
  return grouped.map((g, idx) => {
    const pid   = g.pdvId as string
    const store = storeMap.get(pid)

    return {
      rank:               idx + 1,
      id:                 pid,
      nome:               store?.name ?? 'PDV',
      cidade:             store?.cidade ?? '',
      uf:                 store?.uf ?? '',
      totalLeads:         g._count.id,
      managerPromoterId:  store?.managerPromoterId ?? null,
      managerName:        store?.managerPromoter?.nome ?? null,
    }
  })
}
