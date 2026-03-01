import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─── GET /api/kanban/leads ───────────────────────────────────────────────────
// Query params:
//   ?leadType=B2C|B2B     (obrigatório)
//   ?tenantId=xxx         (ADMIN_MASTER only)
//   ?search=              (busca por nome, placa, cnpj)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { role, tenantId: sessionTenantId } = session
  const allowed = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER']
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const qLeadType = searchParams.get('leadType') ?? 'B2C'
  const qTenant   = searchParams.get('tenantId')
  const qSearch   = searchParams.get('search')?.trim()

  // ─── Filtro de tenant ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { leadType: qLeadType }

  if (role === 'MANAGER' || role === 'FINANCIAL') {
    if (sessionTenantId) where.tenantId = sessionTenantId
  } else if (qTenant) {
    where.tenantId = qTenant
  }

  // ─── Busca textual ───────────────────────────────────────────────────────
  if (qSearch) {
    where.OR = [
      { nomeCliente:  { contains: qSearch } },
      { placa:        { contains: qSearch } },
      { cnpj:         { contains: qSearch } },
      { empresaNome:  { contains: qSearch } },
      { telefone:     { contains: qSearch } },
    ]
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      tenant:   { select: { id: true, nome: true } },
      promotor: { select: { id: true, nome: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // ─── Agrupar por estágio do funil ─────────────────────────────────────────
  const STAGES = [
    'LEAD_COLETADO',
    'IA_EM_ATENDIMENTO',
    'REUNIAO_AGENDADA',
    'CONVERTIDO',
  ] as const

  type Stage = typeof STAGES[number]
  const grouped: Record<Stage, typeof leads> = {
    LEAD_COLETADO:     [],
    IA_EM_ATENDIMENTO: [],
    REUNIAO_AGENDADA:  [],
    CONVERTIDO:        [],
  }

  for (const lead of leads) {
    const stage = (lead.funnelStage as Stage) ?? 'LEAD_COLETADO'
    if (grouped[stage]) grouped[stage].push(lead)
  }

  return NextResponse.json({
    total:   leads.length,
    grouped,
  })
}
