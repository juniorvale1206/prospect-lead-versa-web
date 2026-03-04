/**
 * /api/admin/tenants
 * GET  — lista todos os tenants (ADMIN_MASTER only)
 * POST — cria novo tenant
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session || session.role !== 'ADMIN_MASTER') return null
  return session
}

// ─── GET /api/admin/tenants ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Acesso restrito ao ADMIN_MASTER' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status')   // 'active' | 'inactive' | ''
  const plan   = searchParams.get('plan') || ''

  try {
    // Buscar via SQL raw (colunas novas não estão no Prisma client ainda)
    let sql = `
      SELECT
        t.id, t.nome, t.slug, t.document, t.logoUrl, t.primaryColor,
        t.plan, t.contactName, t.contactEmail, t.contactPhone,
        t.city, t.state, t.maxUsers, t.maxLeads, t.ativo,
        t.createdAt, t.updatedAt,
        COUNT(DISTINCT u.id) as userCount,
        COUNT(DISTINCT l.id) as leadCount,
        COUNT(DISTINCT ag.id) as agentCount
      FROM Tenant t
      LEFT JOIN User u ON u.tenantId = t.id
      LEFT JOIN Lead l ON l.tenantId = t.id
      LEFT JOIN Agent ag ON ag.tenantId = t.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (search) {
      sql += ` AND (t.nome LIKE ? OR t.document LIKE ? OR t.contactEmail LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (status === 'active')   { sql += ` AND t.ativo = 1`; }
    if (status === 'inactive') { sql += ` AND t.ativo = 0`; }
    if (plan) { sql += ` AND t.plan = ?`; params.push(plan); }

    sql += ` GROUP BY t.id ORDER BY t.createdAt DESC`

    const tenants = await prisma.$queryRawUnsafe(sql, ...params) as Record<string, unknown>[]

    // Totais para stats
    const stats = {
      total:    tenants.length,
      active:   tenants.filter(t => t.ativo === 1 || t.ativo === true).length,
      inactive: tenants.filter(t => t.ativo === 0 || t.ativo === false).length,
      plans: {
        STANDARD:     tenants.filter(t => t.plan === 'STANDARD').length,
        PROFESSIONAL: tenants.filter(t => t.plan === 'PROFESSIONAL').length,
        ENTERPRISE:   tenants.filter(t => t.plan === 'ENTERPRISE').length,
      }
    }

    return NextResponse.json({ tenants, stats })
  } catch (err) {
    console.error('[GET /api/admin/tenants]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST /api/admin/tenants ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Acesso restrito ao ADMIN_MASTER' }, { status: 403 })

  const body = await req.json()
  const { nome, document, logoUrl, primaryColor, plan, contactName, contactEmail, contactPhone, city, state, maxUsers, maxLeads } = body

  if (!nome?.trim()) return NextResponse.json({ error: 'Nome da marca é obrigatório' }, { status: 400 })

  const slug = slugify(nome)
  const existing = await prisma.$queryRaw`SELECT id FROM Tenant WHERE slug = ${slug}` as unknown[]
  if (existing.length) {
    return NextResponse.json({ error: `Slug "${slug}" já existe. Escolha outro nome.` }, { status: 409 })
  }

  try {
    const id  = randomUUID()
    const now = new Date().toISOString()

    await prisma.$executeRawUnsafe(
      `INSERT INTO Tenant (id, nome, slug, document, logoUrl, primaryColor, plan, contactName, contactEmail, contactPhone, city, state, maxUsers, maxLeads, ativo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id, nome.trim(), slug,
      document || null, logoUrl || null,
      primaryColor || '#10b981', plan || 'STANDARD',
      contactName || null, contactEmail || null, contactPhone || null,
      city || null, state || null,
      maxUsers || 10, maxLeads || 1000,
      now, now
    )

    const created = await prisma.$queryRaw`SELECT * FROM Tenant WHERE id = ${id}` as unknown[]
    return NextResponse.json({ tenant: (created as Record<string, unknown>[])[0] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/tenants]', err)
    return NextResponse.json({ error: 'Erro ao criar tenant' }, { status: 500 })
  }
}
