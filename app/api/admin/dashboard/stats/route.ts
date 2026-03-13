/**
 * GET /api/admin/dashboard/stats
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard Stats — Métricas consolidadas para o painel global.
 *
 * Retorna todas as métricas do dashboard em uma única requisição,
 * filtrada pelo tenantId do usuário logado.
 *
 * ROLES: ADMIN_MASTER | FINANCIAL | MANAGER
 *
 * ─── RESPONSE 200 ─────────────────────────────────────────────────────────────
 * {
 *   success: true,
 *   period: { start: ISO, end: ISO, label: "Março/2026" },
 *   stats: {
 *     leadsCount:     87,           // leads criados no mês
 *     leadsGrowth:    12.5,         // % crescimento vs mês anterior
 *     salesCount:     14,           // leads com status SALE_CLOSED
 *     salesGrowth:    8.3,
 *     mrrTotal:       15400.00,     // soma planValue das vendas do mês
 *     mrrGrowth:      21.0,
 *     pendingWithdrawals: 2300.00,  // total saques PENDING
 *     leadsByOrigin: [
 *       { origin: "QR_CODE_PDV",       count: 23 },
 *       { origin: "MANUAL_PDV",         count: 18 },
 *       { origin: "RADAR_B2B",          count: 31 },
 *       { origin: "PROMOTER_APP",       count: 9  },
 *       { origin: "WHATSAPP_ORGANICO",  count: 6  }
 *     ],
 *     conversionFunnel: [
 *       { stage: "LEAD_COLETADO",       count: 87 },
 *       { stage: "IA_EM_ATENDIMENTO",   count: 54 },
 *       { stage: "REUNIAO_AGENDADA",    count: 22 },
 *       { stage: "CONVERTIDO",          count: 14 }
 *     ],
 *     topPartners: [
 *       { rank: 1, id: "cuid", nome: "Posto Shell Anhangabaú", type: "PDV", totalLeads: 23 },
 *       { rank: 2, ... },
 *       { rank: 3, ... }
 *     ]
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthRange(offset = 0): { start: Date; end: Date } {
  const now   = new Date()
  const year  = now.getUTCFullYear()
  const month = now.getUTCMonth() + offset        // offset=0 → current, -1 → previous
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  const end   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return parseFloat((((curr - prev) / prev) * 100).toFixed(1))
}

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// ─── GET /api/admin/dashboard/stats ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession()
  if (!session || !(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const tenantId = session.tenantId as string | undefined

  // ── Date ranges ──────────────────────────────────────────────────────────
  const curr = monthRange(0)
  const prev = monthRange(-1)

  // ── Tenant filter helper ─────────────────────────────────────────────────
  const tf = tenantId ? { tenantId } : {}

  try {
    // ── Parallel aggregations via Promise.all ─────────────────────────────
    const [
      leadsCountCurr,
      leadsCountPrev,
      salesCountCurr,
      salesCountPrev,
      mrrResult,
      mrrPrevResult,
      pendingWithdrawals,
      leadsByOriginRaw,
      conversionFunnelRaw,
      topPdvsRaw,
      topPromotersRaw,
    ] = await Promise.all([
      // 1. Total leads mês atual
      prisma.lead.count({
        where: { ...tf, createdAt: { gte: curr.start, lte: curr.end } },
      }),

      // 2. Total leads mês anterior (para % crescimento)
      prisma.lead.count({
        where: { ...tf, createdAt: { gte: prev.start, lte: prev.end } },
      }),

      // 3. Vendas fechadas mês atual (Lead.status = VENDIDO)
      prisma.lead.count({
        where: { ...tf, status: 'VENDIDO', createdAt: { gte: curr.start, lte: curr.end } },
      }),

      // 4. Vendas fechadas mês anterior
      prisma.lead.count({
        where: { ...tf, status: 'VENDIDO', createdAt: { gte: prev.start, lte: prev.end } },
      }),

      // 5. MRR mês atual — soma totalAmount das vendas
      prisma.sale.aggregate({
        where: { ...tf, createdAt: { gte: curr.start, lte: curr.end } },
        _sum: { totalAmount: true },
      }),

      // 6. MRR mês anterior
      prisma.sale.aggregate({
        where: { ...tf, createdAt: { gte: prev.start, lte: prev.end } },
        _sum: { totalAmount: true },
      }),

      // 7. Saques pendentes (todos os tempos)
      prisma.withdrawalRequest.aggregate({
        where: { ...tf, status: 'PENDING' },
        _sum: { amount: true },
      }),

      // 8. Leads por origem (sourceType) no mês atual
      prisma.lead.groupBy({
        by: ['sourceType'],
        where: { ...tf, createdAt: { gte: curr.start, lte: curr.end } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // 9. Funil de conversão — contagem por funnelStage (mês atual)
      prisma.lead.groupBy({
        by: ['funnelStage'],
        where: { ...tf, createdAt: { gte: curr.start, lte: curr.end } },
        _count: { id: true },
      }),

      // 10. Top 3 PDVs por leads no mês atual
      prisma.lead.groupBy({
        by: ['pdvId'],
        where: {
          ...tf,
          pdvId: { not: null },
          createdAt: { gte: curr.start, lte: curr.end },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 3,
      }),

      // 11. Top 3 Promotores por leads no mês atual
      prisma.lead.groupBy({
        by: ['promotorId'],
        where: {
          ...tf,
          promotorId: { not: null },
          createdAt: { gte: curr.start, lte: curr.end },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 3,
      }),
    ])

    // ── Enriquece top PDVs com nomes ─────────────────────────────────────
    const pdvIds = topPdvsRaw
      .map((r) => r.pdvId)
      .filter((id): id is string => Boolean(id))

    const promotorIds = topPromotersRaw
      .map((r) => r.promotorId)
      .filter((id): id is string => Boolean(id))

    const [pdvStores, promotorUsers] = await Promise.all([
      pdvIds.length > 0
        ? prisma.partnerStore.findMany({
            where: { id: { in: pdvIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      promotorIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: promotorIds } },
            select: { id: true, nome: true },
          })
        : Promise.resolve([]),
    ])

    const pdvMap = new Map(pdvStores.map((p) => {
      const store = p as { id: string; name: string }
      return [store.id, store.name] as const
    }))
    const promotorMap = new Map(promotorUsers.map((u) => [u.id, u.nome]))

    // ── Monta topPartners (PDVs + Promotores, top 3 combinados) ──────────
    const topPdvs = topPdvsRaw.map((r, i) => ({
      rank:       i + 1,
      id:         r.pdvId ?? '',
      nome:       pdvMap.get(r.pdvId ?? '') ?? 'PDV',
      type:       'PDV' as const,
      totalLeads: r._count.id,
    }))

    const topPromoters = topPromotersRaw.map((r, i) => ({
      rank:       i + 1,
      id:         r.promotorId ?? '',
      nome:       promotorMap.get(r.promotorId ?? '') ?? 'Promotor',
      type:       'PROMOTER' as const,
      totalLeads: r._count.id,
    }))

    // Combina e re-ordena para top 3 absoluto
    const topPartners = [...topPdvs, ...topPromoters]
      .sort((a, b) => b.totalLeads - a.totalLeads)
      .slice(0, 3)
      .map((item, idx) => ({ ...item, rank: idx + 1 }))

    // ── Funnel ordenado ───────────────────────────────────────────────────
    const FUNNEL_ORDER = ['LEAD_COLETADO', 'IA_EM_ATENDIMENTO', 'REUNIAO_AGENDADA', 'CONVERTIDO']
    const conversionFunnel = FUNNEL_ORDER.map((stage) => ({
      stage,
      count: conversionFunnelRaw.find((r) => r.funnelStage === stage)?._count.id ?? 0,
    }))

    // ── Calcula crescimentos ──────────────────────────────────────────────
    const mrrCurr = mrrResult._sum?.totalAmount ?? 0
    const mrrPrev = mrrPrevResult._sum?.totalAmount ?? 0

    // ── Period label ──────────────────────────────────────────────────────
    const now   = new Date()
    const label = `${MONTH_NAMES[now.getMonth()]}/${now.getFullYear()}`

    return NextResponse.json({
      success: true,
      period: {
        start: curr.start.toISOString(),
        end:   curr.end.toISOString(),
        label,
      },
      stats: {
        // Leads
        leadsCount:  leadsCountCurr,
        leadsGrowth: pctChange(leadsCountCurr, leadsCountPrev),

        // Vendas
        salesCount:  salesCountCurr,
        salesGrowth: pctChange(salesCountCurr, salesCountPrev),

        // MRR
        mrrTotal:  mrrCurr,
        mrrGrowth: pctChange(mrrCurr, mrrPrev),

        // Saques pendentes
        pendingWithdrawals: pendingWithdrawals._sum.amount ?? 0,

        // Distribuição por origem
        leadsByOrigin: leadsByOriginRaw.map((r) => ({
          origin: r.sourceType,
          count:  r._count.id,
        })),

        // Funil de conversão
        conversionFunnel,

        // Top parceiros
        topPartners,
      },
    })
  } catch (err) {
    console.error('[dashboard/stats] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar métricas do dashboard' },
      { status: 500 },
    )
  }
}
