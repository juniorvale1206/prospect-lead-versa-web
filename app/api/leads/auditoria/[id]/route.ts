import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()

    // Apenas FINANCIAL e ADMIN_MASTER podem auditar
    if (!session || (session.role !== 'FINANCIAL' && session.role !== 'ADMIN_MASTER')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { acao, motivoRejeicao } = await request.json()

    if (!['aprovar', 'rejeitar'].includes(acao)) {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

    // Verificar se lead existe e está pendente
    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }
    if (lead.status !== 'PENDENTE_AUDITORIA') {
      return NextResponse.json({ error: 'Lead já foi auditado' }, { status: 409 })
    }

    const atualizado = await prisma.lead.update({
      where: { id: params.id },
      data: {
        status:          acao === 'aprovar' ? 'AUDITADO_APROVADO' : 'AUDITADO_REJEITADO',
        commissionValue: acao === 'aprovar' ? 2.00 : 1.00,
        motivoRejeicao:  acao === 'rejeitar' ? (motivoRejeicao || 'Foto inadequada') : null,
        auditadoPorId:   session.userId,
        auditadoEm:      new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      lead: {
        id:              atualizado.id,
        status:          atualizado.status,
        commissionValue: atualizado.commissionValue,
        acao,
      },
    })
  } catch (error) {
    console.error('Erro na auditoria:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
