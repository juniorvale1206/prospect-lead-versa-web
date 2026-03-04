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
    const tasks = await prisma.$queryRaw`
      SELECT t.*, l.nomeCliente as leadNome, l.empresaNome as leadEmpresa, 
             l.telefone as leadTelefone, u.nome as userName, u.email as userEmail
      FROM Task t
      LEFT JOIN Lead l ON t.leadId = l.id
      LEFT JOIN User u ON t.userId = u.id
      WHERE t.id = ${params.id}
    ` as Record<string, unknown>[]

    if (!tasks.length) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const task = tasks[0]

    // Verificar acesso: tenant ou próprio usuário
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
    // Verificar que a tarefa existe e o usuário tem acesso
    const existing = await prisma.$queryRaw`
      SELECT id, userId, tenantId FROM Task WHERE id = ${params.id}
    ` as Record<string, unknown>[]

    if (!existing.length) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const task = existing[0]
    if (
      session.role !== 'ADMIN_MASTER' &&
      task.tenantId !== session.tenantId &&
      task.userId !== session.userId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const now = new Date().toISOString()

    // Construir campos a atualizar dinamicamente
    const updates: string[] = [`updatedAt = '${now}'`]
    if (title !== undefined)        updates.push(`title = ${JSON.stringify(title)}`)
    if (description !== undefined)  updates.push(`description = ${description ? JSON.stringify(description) : 'NULL'}`)
    if (dueDate !== undefined)      updates.push(`dueDate = '${new Date(dueDate).toISOString()}'`)
    if (status !== undefined)       updates.push(`status = '${status}'`)
    if (leadId !== undefined)       updates.push(`leadId = ${leadId ? `'${leadId}'` : 'NULL'}`)
    if (assignedUserId !== undefined) updates.push(`userId = '${assignedUserId}'`)

    await prisma.$executeRawUnsafe(
      `UPDATE Task SET ${updates.join(', ')} WHERE id = '${params.id}'`
    )

    // Retornar tarefa atualizada
    const updated = await prisma.$queryRaw`
      SELECT t.*, l.nomeCliente as leadNome, l.empresaNome as leadEmpresa, u.nome as userName
      FROM Task t
      LEFT JOIN Lead l ON t.leadId = l.id
      LEFT JOIN User u ON t.userId = u.id
      WHERE t.id = ${params.id}
    ` as Record<string, unknown>[]

    return NextResponse.json({ task: updated[0] })
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
    const existing = await prisma.$queryRaw`
      SELECT id, userId, tenantId FROM Task WHERE id = ${params.id}
    ` as Record<string, unknown>[]

    if (!existing.length) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    const task = existing[0]
    if (
      session.role !== 'ADMIN_MASTER' &&
      task.tenantId !== session.tenantId &&
      task.userId !== session.userId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    await prisma.$executeRaw`DELETE FROM Task WHERE id = ${params.id}`

    return NextResponse.json({ success: true, message: 'Tarefa excluída com sucesso' })
  } catch (err) {
    console.error('[DELETE /api/tarefas/[id]]', err)
    return NextResponse.json({ error: 'Erro ao excluir tarefa' }, { status: 500 })
  }
}
