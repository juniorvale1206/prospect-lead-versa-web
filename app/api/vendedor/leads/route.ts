/**
 * GET  /api/vendedor/leads  — Leads capturados pelo vendedor PDV
 * POST /api/vendedor/leads  — Novo lead via painel web PDV
 * Role: PARTNER_EMPLOYEE
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PARTNER_EMPLOYEE', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '20')
  const skip   = (page - 1) * limit
  const search = searchParams.get('search') ?? ''
  const stage  = searchParams.get('funnelStage') ?? ''

  const where: Record<string, unknown> = { promotorId: session.userId }

  if (search) {
    where.OR = [
      { nomeCliente: { contains: search } },
      { telefone:    { contains: search } },
      { placa:       { contains: search } },
    ]
  }
  if (stage) where.funnelStage = stage

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, nomeCliente: true, telefone: true,
        veiculo: true, placa: true, leadType: true,
        funnelStage: true, createdAt: true,
        empresaNome: true, frota: true,
      },
    }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({ leads, total, page, limit, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PARTNER_EMPLOYEE', 'ADMIN_MASTER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const { nomeCliente, telefone, email, leadType = 'B2C', veiculo, placa, praca,
          cnpj, empresaNome, frota, segmento, doresIdentificadas } = body

  if (!nomeCliente || !telefone) {
    return NextResponse.json({ error: 'nomeCliente e telefone são obrigatórios' }, { status: 400 })
  }

  const lead = await prisma.lead.create({
    data: {
      nomeCliente, telefone,
      email:    email    || null,
      leadType: leadType || 'B2C',
      veiculo:  veiculo  || '',
      placa:    placa    || '',
      praca:    praca    || '',
      cnpj:        cnpj        || null,
      empresaNome: empresaNome || null,
      frota:       frota       || null,
      segmento:    segmento    || null,
      doresIdentificadas: doresIdentificadas || null,
      promotorId:  session.userId,
      tenantId:    session.tenantId ?? null,
      funnelStage: 'LEAD_COLETADO',
      sourceType:  'MANUAL_WEB',
    },
  })

  return NextResponse.json({ success: true, lead }, { status: 201 })
}
