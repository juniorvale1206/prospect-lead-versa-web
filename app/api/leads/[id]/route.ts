/**
 * GET  /api/leads/[id]  — Perfil completo do lead
 * PATCH /api/leads/[id] — Atualizar dados do lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL', 'CONSULTANT', 'SDR', 'OPERATOR']

export async function GET(
  req:     NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        tenant:   { select: { id: true, nome: true, slug: true, primaryColor: true } },
        promotor: { select: { id: true, nome: true, email: true } },
        auditadoPor: { select: { id: true, nome: true } },
        tasks:    {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: { select: { id: true, nome: true } },
          },
        },
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            product: { select: { name: true, type: true } },
          },
        },
        callLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            agent: { select: { name: true } },
          },
        },
      },
    })

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    // Checar acesso multi-tenant
    if (
      session.role !== 'ADMIN_MASTER' &&
      lead.tenantId &&
      lead.tenantId !== session.tenantId
    ) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    return NextResponse.json({ lead })
  } catch (err) {
    console.error('[api/leads/[id]] GET:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  req:     NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const ALLOWED_FIELDS = [
    'nomeCliente', 'telefone', 'email',
    'veiculo', 'placa', 'praca',
    'cnpj', 'empresaNome', 'frota', 'segmento',
    'doresIdentificadas', 'funnelStage',
    'logradouro', 'numero', 'complemento', 'bairro',
    'municipio', 'uf', 'cep',
  ]

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Filtrar apenas campos permitidos
  const data: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key]
  }

  try {
    const updated = await prisma.lead.update({
      where: { id: params.id },
      data:  data as Parameters<typeof prisma.lead.update>[0]['data'],
    })
    return NextResponse.json({ lead: updated })
  } catch (err) {
    console.error('[api/leads/[id]] PATCH:', err)
    return NextResponse.json({ error: 'Erro ao atualizar lead' }, { status: 500 })
  }
}
