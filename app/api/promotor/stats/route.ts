/**
 * GET /api/promotor/stats
 * Dashboard stats para o Promotor logado.
 * Roles: PROMOTER
 */
import { NextResponse } from 'next/server'
import { getSession }   from '@/lib/auth'
import { prisma }       from '@/lib/prisma'

function monthRange(offset = 0) {
  const now   = new Date()
  const year  = now.getUTCFullYear()
  const month = now.getUTCMonth() + offset
  const start = new Date(Date.UTC(year, month, 1))
  const end   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PROMOTER', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const userId   = session.userId
  const tenantId = session.tenantId
  const { start: mesStart, end: mesEnd } = monthRange(0)
  const { start: antStart, end: antEnd } = monthRange(-1)

  // ── Leads do mês ──────────────────────────────────────────────────────────
  const [leadsHoje, leadsThisMonth, leadsLastMonth] = await Promise.all([
    prisma.lead.count({
      where: {
        promotorId: userId,
        createdAt: {
          gte: new Date(new Date().toISOString().slice(0,10) + 'T00:00:00'),
          lte: new Date(new Date().toISOString().slice(0,10) + 'T23:59:59'),
        },
      },
    }),
    prisma.lead.count({ where: { promotorId: userId, createdAt: { gte: mesStart, lte: mesEnd } } }),
    prisma.lead.count({ where: { promotorId: userId, createdAt: { gte: antStart, lte: antEnd } } }),
  ])

  // ── Vendas do mês ─────────────────────────────────────────────────────────
  const [salesThisMonth, salesLastMonth] = await Promise.all([
    prisma.sale.findMany({
      where: { promoterId: userId, createdAt: { gte: mesStart, lte: mesEnd } },
      select: { totalAmount: true, commissionAmount: true, createdAt: true },
    }),
    prisma.sale.findMany({
      where: { promoterId: userId, createdAt: { gte: antStart, lte: antEnd } },
      select: { totalAmount: true, commissionAmount: true },
    }),
  ])

  // ── Pedidos B2C criados por este promotor ─────────────────────────────────
  const pedidosMes = await prisma.order.count({
    where: { promoterId: userId, createdAt: { gte: mesStart, lte: mesEnd } },
  })

  // ── Últimos leads capturados ───────────────────────────────────────────────
  const recentLeads = await prisma.lead.findMany({
    where: { promotorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, nomeCliente: true, telefone: true, veiculo: true,
      placa: true, leadType: true, funnelStage: true, createdAt: true,
    },
  })

  // ── Funil de conversão ────────────────────────────────────────────────────
  const funnelRaw = await prisma.lead.groupBy({
    by: ['funnelStage'],
    where: { promotorId: userId, tenantId: tenantId ?? undefined },
    _count: { id: true },
  })
  const funnel = funnelRaw.map(f => ({ stage: f.funnelStage, count: f._count.id }))

  // ── Comissões pendentes ───────────────────────────────────────────────────
  let commissionPending = 0
  let commissionPaidMonth = 0
  try {
    const [pending, paidMonth] = await Promise.all([
      prisma.commissionEntry.aggregate({
        where: { userId, status: 'PENDING' },
        _sum: { netValue: true },
      }),
      prisma.commissionEntry.aggregate({
        where: { userId, status: 'PAID', createdAt: { gte: mesStart, lte: mesEnd } },
        _sum: { netValue: true },
      }),
    ])
    commissionPending   = pending._sum.netValue   ?? 0
    commissionPaidMonth = paidMonth._sum.netValue ?? 0
  } catch { /* CommissionEntry pode não existir ainda */ }

  // ── Ranking do mês (posição do promotor) ──────────────────────────────────
  let rankPosition = null
  try {
    const allPromoters = await prisma.sale.groupBy({
      by: ['promoterId'],
      where: { createdAt: { gte: mesStart, lte: mesEnd }, ...(tenantId ? { tenantId } : {}) },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })
    const myRank = allPromoters.findIndex(p => p.promoterId === userId)
    if (myRank !== -1) rankPosition = myRank + 1
  } catch { /* Ignorar */ }

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const totalVendasMes    = salesThisMonth.reduce((s, v) => s + v.totalAmount, 0)
  const totalVendasAnt    = salesLastMonth.reduce((s, v) => s + v.totalAmount, 0)
  const totalComissoesMes = salesThisMonth.reduce((s, v) => s + v.commissionAmount, 0)

  function pct(current: number, prev: number) {
    if (prev === 0) return current > 0 ? 100 : 0
    return Math.round(((current - prev) / prev) * 100)
  }

  return NextResponse.json({
    success: true,
    period: {
      label: mesStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      start: mesStart.toISOString(),
      end:   mesEnd.toISOString(),
    },
    stats: {
      leadsHoje,
      leadsThisMonth,
      leadsGrowth:    pct(leadsThisMonth, leadsLastMonth),
      salesCount:     salesThisMonth.length,
      salesGrowth:    pct(salesThisMonth.length, salesLastMonth.length),
      totalVendasMes,
      totalVendasAnt,
      vendasGrowth:   pct(totalVendasMes, totalVendasAnt),
      totalComissoesMes,
      commissionPending,
      commissionPaidMonth,
      pedidosMes,
      rankPosition,
      funnel,
      recentLeads,
    },
  })
}
