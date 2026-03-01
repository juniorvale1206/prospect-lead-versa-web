/**
 * PATCH  /api/admin/usuarios/[id]  — Atualiza usuário
 * DELETE /api/admin/usuarios/[id]  — Bloqueia (ativo=false) ou exclui usuário
 *
 * Acesso: ADMIN_MASTER apenas
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getSession }                 from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import bcrypt                         from 'bcryptjs'

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

/* ── PATCH — editar usuário ─────────────────────────────────────────────── */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session)                         return err('Não autenticado', 401)
  if (session.role !== 'ADMIN_MASTER')  return err('Acesso negado', 403)

  const { id } = params

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('JSON inválido') }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return err('Usuário não encontrado', 404)

  // campos editáveis
  const nome     = body.nome     ? String(body.nome).trim()            : undefined
  const email    = body.email    ? String(body.email).trim().toLowerCase() : undefined
  const role     = body.role     ? String(body.role)                   : undefined
  const tenantId = body.tenantId !== undefined
                     ? (body.tenantId ? String(body.tenantId) : null)
                     : undefined
  const ativo    = body.ativo    !== undefined ? Boolean(body.ativo)   : undefined
  const telefone = body.telefone !== undefined
                     ? (body.telefone ? String(body.telefone).trim() : null)
                     : undefined

  // troca de senha opcional
  let passwordHash: string | undefined
  if (body.senha && String(body.senha).trim().length >= 6) {
    passwordHash = await bcrypt.hash(String(body.senha).trim(), 12)
  }

  // validar e-mail duplicado (se mudou)
  if (email && email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email } })
    if (dup) return err('E-mail já está em uso por outro usuário', 409)
  }

  // MANAGER precisa de tenant
  const nextRole     = role     ?? target.role
  const nextTenantId = tenantId !== undefined ? tenantId : target.tenantId
  if (nextRole === 'MANAGER' && !nextTenantId) {
    return err('Gestor precisa de uma Franquia/Marca vinculada')
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(nome         !== undefined && { nome }),
      ...(email        !== undefined && { email }),
      ...(role         !== undefined && { role }),
      ...(tenantId     !== undefined && { tenantId }),
      ...(ativo        !== undefined && { ativo }),
      ...(telefone     !== undefined && { telefone }),
      ...(passwordHash !== undefined && { password: passwordHash }),
    },
    select: {
      id: true, nome: true, email: true, role: true,
      ativo: true, telefone: true, createdAt: true,
      tenant: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json({ success: true, user })
}

/* ── DELETE — bloquear/excluir usuário ──────────────────────────────────── */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session)                         return err('Não autenticado', 401)
  if (session.role !== 'ADMIN_MASTER')  return err('Acesso negado', 403)

  const { id } = params

  // Proteger a própria conta
  if (id === session.userId) return err('Não é possível excluir seu próprio usuário', 400)

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return err('Usuário não encontrado', 404)

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'block'   // 'block' | 'delete'

  if (mode === 'delete') {
    // Exclusão definitiva — apenas se não houver leads vinculados
    const leadsCount = await prisma.lead.count({
      where: { promotorId: id },
    })
    if (leadsCount > 0) {
      // Bloquear em vez de excluir para preservar integridade referencial
      await prisma.user.update({ where: { id }, data: { ativo: false } })
      return NextResponse.json({
        success: true,
        action: 'blocked',
        message: `Usuário possui ${leadsCount} leads vinculados — foi bloqueado em vez de excluído.`,
      })
    }
    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ success: true, action: 'deleted' })
  }

  // Bloquear (toggle ativo)
  const updated = await prisma.user.update({
    where: { id },
    data:  { ativo: !target.ativo },
    select: { id: true, ativo: true, nome: true },
  })

  return NextResponse.json({
    success: true,
    action:  updated.ativo ? 'activated' : 'blocked',
    user:    updated,
  })
}
