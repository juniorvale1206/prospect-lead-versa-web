/**
 * GET  /api/admin/usuarios   — Lista todos os usuários (exceto PROMOTER/PARTNER_EMPLOYEE)
 * POST /api/admin/usuarios   — Cria novo usuário
 *
 * Acesso: ADMIN_MASTER apenas
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }               from '@/lib/auth'
import { prisma }                   from '@/lib/prisma'
import bcrypt                       from 'bcryptjs'

/* ── helpers ─────────────────────────────────────────────────────────────── */
function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

/* ── GET — listar usuários ───────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session)                          return err('Não autenticado', 401)
  if (session.role !== 'ADMIN_MASTER')   return err('Acesso negado', 403)

  const { searchParams } = new URL(req.url)
  const search  = searchParams.get('search')  ?? ''
  const roleQ   = searchParams.get('role')    ?? ''
  const statusQ = searchParams.get('status')  ?? ''

  const users = await prisma.user.findMany({
    where: {
      // exclui promotores mobile do painel de gestão de usuários do sistema
      role: {
        notIn: ['PROMOTER', 'PARTNER_EMPLOYEE'],
        ...(roleQ ? { equals: roleQ } : {}),
      },
      ...(search ? {
        OR: [
          { nome:  { contains: search } },
          { email: { contains: search } },
        ],
      } : {}),
      ...(statusQ === 'ativo'   ? { ativo: true  } : {}),
      ...(statusQ === 'inativo' ? { ativo: false } : {}),
    },
    select: {
      id:        true,
      nome:      true,
      email:     true,
      role:      true,
      ativo:     true,
      telefone:  true,
      avatarUrl: true,
      createdAt: true,
      tenant: {
        select: { id: true, nome: true, slug: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ success: true, users })
}

/* ── POST — criar usuário ────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session)                          return err('Não autenticado', 401)
  if (session.role !== 'ADMIN_MASTER')   return err('Acesso negado', 403)

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('JSON inválido') }

  const nome     = String(body.nome     ?? '').trim()
  const email    = String(body.email    ?? '').trim().toLowerCase()
  const senha    = String(body.senha    ?? '').trim()
  const role     = String(body.role     ?? 'MANAGER').trim()
  const tenantId = body.tenantId ? String(body.tenantId) : null
  const telefone = body.telefone ? String(body.telefone).trim() : null

  /* validações */
  if (!nome)                           return err('Nome é obrigatório')
  if (!email || !email.includes('@'))  return err('E-mail inválido')
  if (!senha || senha.length < 6)      return err('Senha deve ter ao menos 6 caracteres')

  const VALID_ROLES = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER', 'TEAM_LEADER']
  if (!VALID_ROLES.includes(role))     return err(`Nível inválido: ${role}`)

  // MANAGER precisa de tenant
  if (role === 'MANAGER' && !tenantId) return err('Gestor precisa de uma Franquia/Marca vinculada')

  /* e-mail duplicado */
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return err('Já existe um usuário com este e-mail', 409)

  /* hash da senha */
  const passwordHash = await bcrypt.hash(senha, 12)

  const user = await prisma.user.create({
    data: {
      nome,
      email,
      password: passwordHash,
      role,
      telefone,
      tenantId,
      ativo: true,
    },
    select: {
      id: true, nome: true, email: true, role: true,
      ativo: true, telefone: true, createdAt: true,
      tenant: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json({ success: true, user }, { status: 201 })
}
