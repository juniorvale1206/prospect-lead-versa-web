/**
 * GET /api/vendedor/stats
 * Dashboard stats para Vendedor PDV (PARTNER_EMPLOYEE) logado.
 */
import { NextResponse } from 'next/server'
import { getSession }   from '@/lib/auth'
import { prisma }       from '@/lib/prisma'

function monthRange(offset = 0) {
  const now   = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PARTNER_EMPLOYEE', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const userId   = session.userId
  const tenantId = session.tenantId
  const { start: mesStart, end: mesEnd }  = monthRange(0)
  const { start: antStart, end: antEnd }  = monthRange(-1)
  const hoje = new Date().toISOString().slice(0,10)

  // ── Leads que este vendedor capturou via PDV ───────────────────────────────
  const [leadsHoje, leadsThisMonth, leadsLastMonth] = await Promise.all([
    prisma.lead.count({
      where: {
        promotorId: userId,
        createdAt: { gte: new Date(hoje + 'T00:00:00'), lte: new Date(hoje + 'T23:59:59') },
      },
    }),
    prisma.lead.count({ where: { promotorId: userId, createdAt: { gte: mesStart, lte: mesEnd } } }),
    prisma.lead.count({ where: { promotorId: userId, createdAt: { gte: antStart, lte: antEnd } } }),
  ])

  // ── Lojas PDV onde este vendedor trabalha ─────────────────────────────────
  let stores: { id: string; name: string; cidade?: string | null }[] = []
  try {
    const pdvEmps = await prisma.pdvEmployee.findMany({
      where: { userId },
      include: { pdv: { select: { id: true, name: true, cidade: true } } },
    })
    stores = pdvEmps.map(e => e.pdv)
  } catch { /* modelo pode não ter dados */ }

  // ── Comissões deste mês ───────────────────────────────────────────────────
  let commissionMes = 0
  let commissionPending = 0
  try {
    const [mes, pending] = await Promise.all([
      prisma.commissionEntry.aggregate({
        where: { userId, createdAt: { gte: mesStart, lte: mesEnd } },
        _sum: { netValue: true },
      }),
      prisma.commissionEntry.aggregate({
        where: { userId, status: 'PENDING' },
        _sum: { netValue: true },
      }),
    ])
    commissionMes     = mes._sum.netValue     ?? 0
    commissionPending = pending._sum.netValue ?? 0
  } catch { /* ignorar */ }

  // ── Últimos leads capturados ───────────────────────────────────────────────
  const recentLeads = await prisma.lead.findMany({
    where: { promotorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true, nomeCliente: true, telefone: true,
      placa: true, leadType: true, funnelStage: true, createdAt: true,
    },
  })

  function pct(a: number, b: number) {
    if (b === 0) return a > 0 ? 100 : 0
    return Math.round(((a - b) / b) * 100)
  }

  return NextResponse.json({
    success: true,
    stats: {
      leadsHoje,
      leadsThisMonth,
      leadsGrowth:      pct(leadsThisMonth, leadsLastMonth),
      commissionMes,
      commissionPending,
      stores,
      recentLeads,
    },
  })
}
