/**
 * /api/admin/tenants/[id]
 * GET    — detalhes do tenant
 * PATCH  — atualizar campos
 * DELETE — desativar (soft delete)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session || session.role !== 'ADMIN_MASTER') return null
  return session
}

// ─── GET /api/admin/tenants/[id] ──────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT t.*,
        COUNT(DISTINCT u.id) as userCount,
        COUNT(DISTINCT l.id) as leadCount,
        COUNT(DISTINCT ag.id) as agentCount,
        COUNT(DISTINCT c.id) as campaignCount
      FROM Tenant t
      LEFT JOIN User u ON u.tenantId = t.id
      LEFT JOIN Lead l ON l.tenantId = t.id
      LEFT JOIN Agent ag ON ag.tenantId = t.id
      LEFT JOIN Campaign c ON c.tenantId = t.id
      WHERE t.id = ?
      GROUP BY t.id
    `, params.id) as Record<string, unknown>[]

    if (!rows.length) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    return NextResponse.json({ tenant: rows[0] })
  } catch (err) {
    console.error('[GET /api/admin/tenants/[id]]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── PATCH /api/admin/tenants/[id] ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await req.json()

  // Verificar existência
  const existing = await prisma.$queryRaw`SELECT id FROM Tenant WHERE id = ${params.id}` as unknown[]
  if (!existing.length) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })

  try {
    const now = new Date().toISOString()
    const allowed = ['nome', 'document', 'logoUrl', 'primaryColor', 'plan', 'contactName', 'contactEmail', 'contactPhone', 'city', 'state', 'maxUsers', 'maxLeads', 'ativo']

    const setClauses: string[] = [`updatedAt = '${now}'`]
    const values: unknown[] = []

    for (const key of allowed) {
      if (key in body) {
        setClauses.push(`${key} = ?`)
        values.push(body[key] === '' ? null : body[key])
      }
    }

    if (setClauses.length === 1) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    values.push(params.id)
    await prisma.$executeRawUnsafe(
      `UPDATE Tenant SET ${setClauses.join(', ')} WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw`SELECT * FROM Tenant WHERE id = ${params.id}` as unknown[]
    return NextResponse.json({ tenant: (updated as Record<string, unknown>[])[0] })
  } catch (err) {
    console.error('[PATCH /api/admin/tenants/[id]]', err)
    return NextResponse.json({ error: 'Erro ao atualizar tenant' }, { status: 500 })
  }
}

// ─── DELETE /api/admin/tenants/[id] — soft delete (ativo = false) ─────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const existing = await prisma.$queryRaw`SELECT id, nome FROM Tenant WHERE id = ${params.id}` as Record<string, unknown>[]
  if (!existing.length) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })

  const now = new Date().toISOString()
  await prisma.$executeRawUnsafe(
    `UPDATE Tenant SET ativo = 0, updatedAt = ? WHERE id = ?`,
    now, params.id
  )

  return NextResponse.json({ success: true, message: `Marca "${existing[0].nome}" desativada com sucesso.` })
}
