import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/tarefas — lista tarefas do tenant com filtros
export async function GET(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const leadId = searchParams.get('leadId')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')

  try {
    const where: Record<string, unknown> = {}

    if (session.role !== 'ADMIN_MASTER' && session.tenantId) {
      where.tenantId = session.tenantId
    }
    if (session.role === 'PROMOTER' || session.role === 'PARTNER_EMPLOYEE') {
      where.userId = session.userId
    }
    if (status) where.status = status
    if (leadId) where.leadId = leadId
    if (from || to) {
      where.dueDate = {} as Record<string, Date>
      if (from) (where.dueDate as Record<string, Date>).gte = new Date(from)
      if (to)   (where.dueDate as Record<string, Date>).lte = new Date(to)
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        lead: { select: { nomeCliente: true, empresaNome: true, telefone: true } },
        user: { select: { nome: true, email: true } },
      },
    })

    return NextResponse.json({ tasks, total: tasks.length })
  } catch (err) {
    console.error('[GET /api/tarefas]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST /api/tarefas — criar nova tarefa
export async function POST(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { title, description, dueDate, status = 'PENDING', leadId, assignedUserId } = body

  if (!title || !dueDate) {
    return NextResponse.json({ error: 'Campos obrigatórios: title, dueDate' }, { status: 400 })
  }

  const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  try {
    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? null,
        dueDate: new Date(dueDate),
        status,
        leadId: leadId ?? null,
        userId: assignedUserId ?? session.userId,
        tenantId: session.tenantId ?? null,
      },
      include: {
        lead: { select: { nomeCliente: true, empresaNome: true } },
        user: { select: { nome: true } },
      },
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tarefas]', err)
    return NextResponse.json({ error: 'Erro ao criar tarefa' }, { status: 500 })
  }
}
