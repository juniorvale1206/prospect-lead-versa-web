/**
 * GET  /api/promotor/leads  — Lista leads do promotor logado
 * POST /api/promotor/leads  — Cria novo lead B2C/B2B via painel web
 * Roles: PROMOTER
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PROMOTER', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page       = parseInt(searchParams.get('page')  ?? '1')
  const limit      = parseInt(searchParams.get('limit') ?? '20')
  const skip       = (page - 1) * limit
  const search     = searchParams.get('search')     ?? ''
  const funnelStage= searchParams.get('funnelStage') ?? ''
  const leadType   = searchParams.get('leadType')   ?? ''
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')

  const where: Record<string, unknown> = { promotorId: session.userId }
  if (session.tenantId) where.tenantId = session.tenantId

  if (search) {
    where.OR = [
      { nomeCliente: { contains: search } },
      { telefone:    { contains: search } },
      { placa:       { contains: search } },
    ]
  }
  if (funnelStage) where.funnelStage = funnelStage
  if (leadType)    where.leadType    = leadType
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(from)
    if (to)   range.lte = new Date(to + 'T23:59:59')
    where.createdAt = range
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, nomeCliente: true, telefone: true, email: true,
        veiculo: true, placa: true, leadType: true, funnelStage: true,
        cnpj: true, empresaNome: true, frota: true,
        doresIdentificadas: true, createdAt: true,
        platePhotoUrl: true,
      },
    }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({ leads, total, page, limit, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['PROMOTER', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const {
    nomeCliente, telefone, email, leadType = 'B2C',
    veiculo, placa, praca,
    cnpj, empresaNome, frota, segmento,
    doresIdentificadas,
  } = body

  if (!nomeCliente || !telefone) {
    return NextResponse.json({ error: 'nomeCliente e telefone são obrigatórios' }, { status: 400 })
  }

  const lead = await prisma.lead.create({
    data: {
      nomeCliente,
      telefone,
      email:              email         || null,
      leadType:           leadType       || 'B2C',
      veiculo:            veiculo        || '',
      placa:              placa          || '',
      praca:              praca          || '',
      cnpj:               cnpj           || null,
      empresaNome:        empresaNome    || null,
      frota:              frota          || null,
      segmento:           segmento       || null,
      doresIdentificadas: doresIdentificadas || null,
      promotorId:         session.userId,
      tenantId:           session.tenantId ?? null,
      funnelStage:        'LEAD_COLETADO',
      sourceType:         'MANUAL_WEB',
    },
  })

  return NextResponse.json({ success: true, lead }, { status: 201 })
}
