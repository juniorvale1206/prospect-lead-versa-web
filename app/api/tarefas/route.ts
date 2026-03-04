import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// GET /api/tarefas — lista tarefas do tenant com filtros
export async function GET(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')       // PENDING | IN_PROGRESS | COMPLETED | CANCELED
  const leadId = searchParams.get('leadId')
  const from   = searchParams.get('from')         // ISO date
  const to     = searchParams.get('to')           // ISO date

  try {
    const where: Record<string, unknown> = {}

    // Filtro por tenant (admin_master vê todos)
    if (session.role !== 'ADMIN_MASTER' && session.tenantId) {
      where.tenantId = session.tenantId
    }
    // Usuários comuns veem apenas as próprias tarefas
    if (session.role === 'PROMOTER' || session.role === 'PARTNER_EMPLOYEE') {
      where.userId = session.userId
    }

    if (status) where.status = status
    if (leadId) where.leadId = leadId
    if (from || to) {
      where.dueDate = {}
      if (from) (where.dueDate as Record<string, unknown>).gte = new Date(from)
      if (to)   (where.dueDate as Record<string, unknown>).lte = new Date(to)
    }

    const tasks = await prisma.$queryRaw`
      SELECT 
        t.id, t.title, t.description, t.dueDate, t.status,
        t.leadId, t.userId, t.tenantId, t.createdAt, t.updatedAt,
        l.nomeCliente as leadNome, l.empresaNome as leadEmpresa, l.telefone as leadTelefone,
        u.nome as userName, u.email as userEmail
      FROM Task t
      LEFT JOIN Lead l ON t.leadId = l.id
      LEFT JOIN User u ON t.userId = u.id
      WHERE 1=1
      ${session.role !== 'ADMIN_MASTER' && session.tenantId ? `AND t.tenantId = '${session.tenantId}'` : ''}
      ${(session.role === 'PROMOTER' || session.role === 'PARTNER_EMPLOYEE') ? `AND t.userId = '${session.userId}'` : ''}
      ${status ? `AND t.status = '${status}'` : ''}
      ${leadId ? `AND t.leadId = '${leadId}'` : ''}
      ${from ? `AND t.dueDate >= '${from}'` : ''}
      ${to ? `AND t.dueDate <= '${to}'` : ''}
      ORDER BY t.dueDate ASC
    ` as unknown[]

    return NextResponse.json({ tasks, total: (tasks as unknown[]).length })
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
    const id = randomUUID()
    const userId = assignedUserId || session.userId
    const tenantId = session.tenantId || null
    const now = new Date().toISOString()

    await prisma.$executeRaw`
      INSERT INTO Task (id, title, description, dueDate, status, leadId, userId, tenantId, createdAt, updatedAt)
      VALUES (
        ${id}, ${title}, ${description || null},
        ${new Date(dueDate).toISOString()}, ${status},
        ${leadId || null}, ${userId}, ${tenantId},
        ${now}, ${now}
      )
    `

    // Buscar a tarefa recém-criada
    const tasks = await prisma.$queryRaw`
      SELECT t.*, l.nomeCliente as leadNome, l.empresaNome as leadEmpresa, u.nome as userName
      FROM Task t
      LEFT JOIN Lead l ON t.leadId = l.id
      LEFT JOIN User u ON t.userId = u.id
      WHERE t.id = ${id}
    ` as unknown[]

    return NextResponse.json({ task: (tasks as Record<string, unknown>[])[0] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tarefas]', err)
    return NextResponse.json({ error: 'Erro ao criar tarefa' }, { status: 500 })
  }
}
