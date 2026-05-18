import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/tarefas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        lead: { select: { nomeCliente: true, empresaNome: true, telefone: true } },
        user: { select: { nome: true, email: true } },
      },
    })

    if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

    if (
      session.role !== 'ADMIN_MASTER' &&
      task.tenantId !== session.tenantId &&
      task.userId !== session.userId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    return NextResponse.json({ task })
  } catch (err) {
    console.error('[GET /api/tarefas/[id]]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PATCH /api/tarefas/[id] — atualizar tarefa
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { title, description, dueDate, status, leadId, assignedUserId } = body

  const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  try {
    const existing = await prisma.task.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

    if (
      session.role !== 'ADMIN_MASTER' &&
      existing.tenantId !== session.tenantId &&
      existing.userId !== session.userId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(status !== undefined && { status }),
        ...(leadId !== undefined && { leadId: leadId || null }),
        ...(assignedUserId !== undefined && { userId: assignedUserId }),
      },
      include: {
        lead: { select: { nomeCliente: true, empresaNome: true } },
        user: { select: { nome: true } },
      },
    })

    return NextResponse.json({ task })
  } catch (err) {
    console.error('[PATCH /api/tarefas/[id]]', err)
    return NextResponse.json({ error: 'Erro ao atualizar tarefa' }, { status: 500 })
  }
}

// DELETE /api/tarefas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const existing = await prisma.task.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

    if (
      session.role !== 'ADMIN_MASTER' &&
      existing.tenantId !== session.tenantId &&
      existing.userId !== session.userId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    await prisma.task.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true, message: 'Tarefa excluída com sucesso' })
  } catch (err) {
    console.error('[DELETE /api/tarefas/[id]]', err)
    return NextResponse.json({ error: 'Erro ao excluir tarefa' }, { status: 500 })
  }
}
