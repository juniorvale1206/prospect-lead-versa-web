import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || (session.role !== 'FINANCIAL' && session.role !== 'ADMIN_MASTER')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'PENDENTE_AUDITORIA'

    const leads = await prisma.lead.findMany({
      where: { status },
      include: {
        tenant: { select: { nome: true, slug: true } },
        auditadoPor: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ leads })
  } catch (error) {
    console.error('Erro ao listar leads:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
