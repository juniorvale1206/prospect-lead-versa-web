/**
 * GET /api/admin/dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de dados do Dashboard Global — apenas ADMIN_MASTER e FINANCIAL.
 *
 * Retorna:
 *   kpis          — 4 métricas do mês atual + comparativo mês anterior
 *   chartVendas   — volume de vendas por tenant (barras)
 *   chartFunil    — leads por estágio do funil (pizza)
 *   chartDiario   — faturamento diário dos últimos 30 dias (linha)
 *   topPromoters  — top 5 promotores por valor gerado
 *
 * OBS: quando há poucos dados reais, mescla com mock data para o design
 * não ficar vazio em ambientes de desenvolvimento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'FINANCIAL'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
function startOfPrevMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return parseFloat((((curr - prev) / prev) * 100).toFixed(1))
}

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || !(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const now       = new Date()
  const thisMonth = startOfMonth(now)
  const prevMonth = startOfPrevMonth(now)
  const last30    = daysAgo(30)

  try {
    /* ── Consultas agregadas em paralelo ─────────────────────────────────── */
    const [
      // KPIs — mês atual
      vendasMes,
      leadsMes,
      vendasCount,
      leadsCount,
      commissoesPendentes,

      // KPIs — mês anterior (comparativo)
      vendasMesAnterior,
      leadsMesAnterior,

      // Gráfico: leads por estágio do funil (todos os tempos)
      leadsPorEstagio,

      // Gráfico: faturamento diário últimos 30 dias
      vendasDiarias,

      // Top promotores
      promotoresRaw,

      // Vendas por tenant (últimos 90 dias)
      vendasPorTenantRaw,
    ] = await Promise.all([

      // Faturamento do mês atual
      prisma.sale.aggregate({
        where:   { createdAt: { gte: thisMonth } },
        _sum:    { totalAmount: true },
        _count:  { id: true },
      }),

      // Leads do mês atual
      prisma.lead.count({ where: { createdAt: { gte: thisMonth } } }),

      // Total de vendas do mês (para taxa de conversão)
      prisma.sale.count({ where: { createdAt: { gte: thisMonth } } }),

      // Total de leads do mês
      prisma.lead.count({ where: { createdAt: { gte: thisMonth } } }),

      // Comissões pendentes (saldo a pagar)
      prisma.commissionLedger.aggregate({
        where: { status: 'PENDING' },
        _sum:  { amount: true },
      }),

      // Faturamento mês anterior + contagem de vendas mês anterior
      prisma.sale.aggregate({
        where: { createdAt: { gte: prevMonth, lt: thisMonth } },
        _sum:  { totalAmount: true },
        _count: { id: true },
      }),

      // Leads mês anterior
      prisma.lead.count({ where: { createdAt: { gte: prevMonth, lt: thisMonth } } }),

      // Leads por estágio do funil
      prisma.lead.groupBy({
        by:      ['funnelStage'],
        _count:  { id: true },
      }),

      // Vendas dos últimos 30 dias (para gráfico de linha)
      prisma.sale.findMany({
        where:   { createdAt: { gte: last30 } },
        select:  { totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Top 5 promotores por valor gerado
      prisma.sale.groupBy({
        by:      ['promoterId'],
        _sum:    { totalAmount: true, commissionAmount: true },
        _count:  { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take:    5,
      }),

      // Vendas por tenant (últimos 90 dias)
      prisma.sale.groupBy({
        by:      ['tenantId'],
        where:   { createdAt: { gte: daysAgo(90) } },
        _sum:    { totalAmount: true },
        _count:  { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      }),
    ])

    /* ── KPIs ────────────────────────────────────────────────────────────── */
    const fatMes      = vendasMes._sum.totalAmount    ?? 0
    const fatAnterior = vendasMesAnterior._sum.totalAmount ?? 0
    const commPend    = commissoesPendentes._sum.amount ?? 0

    const taxaConversao = leadsCount > 0
      ? parseFloat(((vendasCount / leadsCount) * 100).toFixed(1))
      : 0
    const taxaAnterior  = leadsMesAnterior > 0
      ? parseFloat(((vendasMesAnterior._count.id ?? 0) / leadsMesAnterior * 100).toFixed(1))
      : 0

    const kpis = {
      faturamento:    { value: fatMes,          pct: pctChange(fatMes, fatAnterior) },
      leads:          { value: leadsMes,         pct: pctChange(leadsMes, leadsMesAnterior) },
      conversao:      { value: taxaConversao,    pct: pctChange(taxaConversao, taxaAnterior) },
      commissoes:     { value: commPend,         pct: 0 },
    }

    /* ── Gráfico Funil ───────────────────────────────────────────────────── */
    const STAGE_LABELS: Record<string, string> = {
      LEAD_COLETADO:      'Novo',
      IA_EM_ATENDIMENTO:  'IA em Atendimento',
      REUNIAO_AGENDADA:   'Reunião Agendada',
      CONVERTIDO:         'Vendido',
    }
    const STAGE_COLORS: Record<string, string> = {
      LEAD_COLETADO:      '#6366f1',
      IA_EM_ATENDIMENTO:  '#8b5cf6',
      REUNIAO_AGENDADA:   '#f59e0b',
      CONVERTIDO:         '#10b981',
    }
    const chartFunil = leadsPorEstagio.map(s => ({
      name:  STAGE_LABELS[s.funnelStage] ?? s.funnelStage,
      value: s._count.id,
      color: STAGE_COLORS[s.funnelStage] ?? '#94a3b8',
    }))

    /* ── Gráfico Diário (últimos 30 dias) ────────────────────────────────── */
    // Agrupa vendas reais por dia
    const dailyMap = new Map<string, number>()
    for (const v of vendasDiarias) {
      const key = fmtDate(new Date(v.createdAt))
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + v.totalAmount)
    }
    // Gera array dos últimos 30 dias (preenche 0 onde não há venda)
    const chartDiario = Array.from({ length: 30 }, (_, i) => {
      const d   = daysAgo(29 - i)
      const key = fmtDate(d)
      return { data: key, valor: dailyMap.get(key) ?? 0 }
    })

    /* ── Gráfico Vendas por Tenant ───────────────────────────────────────── */
    // Busca nomes dos tenants
    const tenantIds = vendasPorTenantRaw
      .filter(r => r.tenantId)
      .map(r => r.tenantId as string)

    const tenants = tenantIds.length
      ? await prisma.tenant.findMany({
          where:  { id: { in: tenantIds } },
          select: { id: true, nome: true },
        })
      : []
    const tenantMap = new Map(tenants.map(t => [t.id, t.nome]))

    const chartVendas = vendasPorTenantRaw.map(r => ({
      franquia: r.tenantId ? (tenantMap.get(r.tenantId) ?? 'Sem franquia') : 'Global',
      vendas:   r._count.id,
      valor:    r._sum.totalAmount ?? 0,
    }))

    /* ── Top 5 Promotores ────────────────────────────────────────────────── */
    const promoterIds = promotoresRaw.map(r => r.promoterId)
    const promoters   = promoterIds.length
      ? await prisma.user.findMany({
          where:   { id: { in: promoterIds } },
          select:  { id: true, nome: true, avatarUrl: true, fotoUrl: true,
                     tenant: { select: { nome: true } } },
        })
      : []
    const promMap = new Map(promoters.map(p => [p.id, p]))

    const topPromoters = promotoresRaw.map((r, idx) => {
      const user = promMap.get(r.promoterId)
      return {
        rank:       idx + 1,
        id:         r.promoterId,
        nome:       user?.nome          ?? 'Promotor',
        avatar:     user?.fotoUrl       ?? user?.avatarUrl ?? null,
        franquia:   user?.tenant?.nome  ?? '—',
        vendas:     r._count.id,
        valorGerado: r._sum.totalAmount    ?? 0,
        comissao:   r._sum.commissionAmount ?? 0,
      }
    })

    /* ── Merge com mock quando há poucos dados (dev) ─────────────────────── */
    const MOCK_ENABLED = chartVendas.length < 2 || chartDiario.every(d => d.valor === 0)

    return NextResponse.json({
      success:      true,
      mock:         MOCK_ENABLED,
      kpis,
      chartVendas:  MOCK_ENABLED ? getMockVendas()  : chartVendas,
      chartFunil:   MOCK_ENABLED ? getMockFunil()   : (chartFunil.length ? chartFunil : getMockFunil()),
      chartDiario:  MOCK_ENABLED ? getMockDiario()  : chartDiario,
      topPromoters: MOCK_ENABLED ? getMockTop5()    : (topPromoters.length ? topPromoters : getMockTop5()),
      meta: {
        geradoEm: now.toISOString(),
        periodo:  `${thisMonth.toLocaleDateString('pt-BR')} – hoje`,
      },
    })

  } catch (e) {
    console.error('[GET /api/admin/dashboard]', e)
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar métricas.' }, { status: 500 })
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — usado quando o banco ainda tem poucos registros reais
   Nomes realistas: Rastremix, Valeteck, GPSMy, RastroTop
═══════════════════════════════════════════════════════════════════════════ */
function getMockVendas() {
  return [
    { franquia: 'Rastremix',  vendas: 47, valor: 68400  },
    { franquia: 'Valeteck',   vendas: 34, valor: 51200  },
    { franquia: 'GPSMy',      vendas: 28, valor: 39600  },
    { franquia: 'RastroTop',  vendas: 19, valor: 27300  },
    { franquia: 'TeleControl',vendas: 12, valor: 17800  },
  ]
}

function getMockFunil() {
  return [
    { name: 'Novo',                value: 312, color: '#6366f1' },
    { name: 'IA em Atendimento',   value: 187, color: '#8b5cf6' },
    { name: 'Reunião Agendada',    value:  89, color: '#f59e0b' },
    { name: 'Vendido',             value:  47, color: '#10b981' },
  ]
}

function getMockDiario() {
  const base = [
    4200, 3800, 5100, 4700, 6300, 5800, 7200, 6100, 4900, 8300,
    7600, 5400, 6800, 9100, 7800, 6200, 5700, 8400, 7100, 6600,
    9300, 8700, 7400, 6100, 9800, 8200, 7600, 10200, 9100, 11400,
  ]
  return base.map((valor, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return {
      data:  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      valor: valor + Math.floor(Math.random() * 800 - 400),
    }
  })
}

function getMockTop5() {
  return [
    { rank: 1, id: 'm1', nome: 'Ana Lima',       avatar: null, franquia: 'Rastremix',  vendas: 18, valorGerado: 26100, comissao: 7830  },
    { rank: 2, id: 'm2', nome: 'Carlos Mendes',  avatar: null, franquia: 'Valeteck',   vendas: 15, valorGerado: 21750, comissao: 6525  },
    { rank: 3, id: 'm3', nome: 'Fernanda Costa', avatar: null, franquia: 'GPSMy',      vendas: 12, valorGerado: 17400, comissao: 5220  },
    { rank: 4, id: 'm4', nome: 'Rafael Torres',  avatar: null, franquia: 'RastroTop',  vendas:  9, valorGerado: 13050, comissao: 3915  },
    { rank: 5, id: 'm5', nome: 'Juliana Santos', avatar: null, franquia: 'TeleControl',vendas:  7, valorGerado: 10150, comissao: 3045  },
  ]
}
