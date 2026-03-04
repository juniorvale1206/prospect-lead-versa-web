/**
 * /api/tasks/[id]
 * GET    — Detalhe da tarefa
 * PATCH  — Atualiza status, notas, data, título
 * DELETE — Remove tarefa
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const ALLOWED = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL', 'PROMOTER']

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/tasks/[id] ──────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      lead: { select: { id: true, nomeCliente: true, empresaNome: true, telefone: true, cnpj: true, municipio: true, uf: true, funnelStage: true } },
      user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
    },
  })

  if (!task) {
    return NextResponse.json({ success: false, error: 'Tarefa não encontrada.' }, { status: 404 })
  }

  // Autorização por tenant
  if (session.role !== 'ADMIN_MASTER' && task.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  return NextResponse.json({ success: true, task })
}

// ─── PATCH /api/tasks/[id] ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ success: false, error: 'Tarefa não encontrada.' }, { status: 404 })

  if (session.role !== 'ADMIN_MASTER' && task.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { title, description, dueDate, type, priority, status, userId, completionNotes } = body

  // Se marcando como COMPLETED, registra timestamp
  const completedAt = status === 'COMPLETED' ? new Date() : (status && status !== 'COMPLETED' ? null : undefined)

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(title              !== undefined && { title:           title.trim() }),
      ...(description        !== undefined && { description:     description?.trim() ?? null }),
      ...(dueDate            !== undefined && { dueDate:         new Date(dueDate) }),
      ...(type               !== undefined && { type }),
      ...(priority           !== undefined && { priority }),
      ...(status             !== undefined && { status }),
      ...(userId             !== undefined && { userId }),
      ...(completionNotes    !== undefined && { completionNotes: completionNotes?.trim() ?? null }),
      ...(completedAt        !== undefined && { completedAt }),
      updatedAt: new Date(),
    },
    include: {
      lead: { select: { id: true, nomeCliente: true, empresaNome: true } },
      user: { select: { id: true, nome: true, email: true } },
    },
  })

  return NextResponse.json({ success: true, task: updated })
}

// ─── DELETE /api/tasks/[id] ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ success: false, error: 'Tarefa não encontrada.' }, { status: 404 })

  if (session.role !== 'ADMIN_MASTER' && task.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  await prisma.task.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true, message: 'Tarefa removida.' })
}
