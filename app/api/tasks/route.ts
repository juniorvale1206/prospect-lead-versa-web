/**
 * /api/tasks
 * GET  — Lista tarefas do usuário/tenant com filtros
 * POST — Cria nova tarefa de follow-up
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { randomUUID } from 'crypto'

const ALLOWED = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL', 'PROMOTER']

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status')   // PENDING|IN_PROGRESS|COMPLETED|CANCELED
  const leadId   = searchParams.get('leadId')
  const type     = searchParams.get('type')
  const priority = searchParams.get('priority')
  const from     = searchParams.get('from')     // ISO date — início do período
  const to       = searchParams.get('to')       // ISO date — fim do período
  const mine     = searchParams.get('mine') === 'true' // somente tarefas do usuário logado

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}

  // Escopo por tenant (ADMIN_MASTER vê todos)
  if (session.role !== 'ADMIN_MASTER') {
    where.tenantId = session.tenantId ?? undefined
  }

  // Filtros opcionais
  if (status)   where.status   = status
  if (leadId)   where.leadId   = leadId
  if (type)     where.type     = type
  if (priority) where.priority = priority
  if (mine)     where.userId   = session.userId

  if (from || to) {
    where.dueDate = {}
    if (from) where.dueDate.gte = new Date(from)
    if (to)   where.dueDate.lte = new Date(to)
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      lead: { select: { id: true, nomeCliente: true, empresaNome: true, telefone: true, cnpj: true, funnelStage: true } },
      user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
    },
    orderBy: [
      { status:  'asc' },   // PENDING primeiro
      { dueDate: 'asc' },   // mais urgente primeiro
    ],
    take: 200,
  })

  // Contadores por status para o painel
  const counts = {
    total:       tasks.length,
    pending:     tasks.filter(t => t.status === 'PENDING').length,
    inProgress:  tasks.filter(t => t.status === 'IN_PROGRESS').length,
    completed:   tasks.filter(t => t.status === 'COMPLETED').length,
    canceled:    tasks.filter(t => t.status === 'CANCELED').length,
    overdue:     tasks.filter(t => t.status === 'PENDING' && new Date(t.dueDate) < new Date()).length,
  }

  return NextResponse.json({ success: true, tasks, counts })
}

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 })

  const { title, description, dueDate, type, priority, leadId, userId, tenantId: bodyTenantId } = body

  // Validações obrigatórias
  if (!title?.trim())  return NextResponse.json({ success: false, error: 'Título obrigatório.' }, { status: 400 })
  if (!dueDate)        return NextResponse.json({ success: false, error: 'Data/hora obrigatória.' }, { status: 400 })
  if (!leadId)         return NextResponse.json({ success: false, error: 'leadId obrigatório.' }, { status: 400 })

  const tenantId = session.role === 'ADMIN_MASTER'
    ? (bodyTenantId ?? session.tenantId ?? '')
    : (session.tenantId ?? '')

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId não encontrado.' }, { status: 400 })
  }

  // Verifica se o lead existe
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) {
    return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
  }

  const assignedUserId = userId ?? session.userId

  const task = await prisma.task.create({
    data: {
      id:          randomUUID(),
      title:       title.trim(),
      description: description?.trim() ?? null,
      dueDate:     new Date(dueDate),
      type:        type        ?? 'CALL',
      priority:    priority    ?? 'MEDIUM',
      status:      'PENDING',
      leadId,
      userId:      assignedUserId,
      tenantId,
    },
    include: {
      lead: { select: { id: true, nomeCliente: true, empresaNome: true, telefone: true } },
      user: { select: { id: true, nome: true, email: true } },
    },
  })

  return NextResponse.json({ success: true, task }, { status: 201 })
}
