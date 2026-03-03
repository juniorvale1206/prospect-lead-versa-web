/**
 * /api/campaigns
 * GET  — Lista campanhas do tenant
 * POST — Cria nova campanha (DRAFT)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

const ALLOWED = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// ─── GET /api/campaigns ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const where = session.role === 'ADMIN_MASTER' ? {} : { tenantId: session.tenantId ?? undefined }

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      tenant: { select: { id: true, nome: true, slug: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ success: true, campaigns })
}

// ─── POST /api/campaigns ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json()
  const {
    name, templateName, templateVars, templateLanguage,
    audienceFilters, scheduledAt, tenantId: bodyTenantId,
  } = body

  if (!name?.trim())         return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nome é obrigatório.' } }, { status: 400 })
  if (!templateName?.trim()) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'templateName é obrigatório.' } }, { status: 400 })

  const tenantId = session.role === 'ADMIN_MASTER'
    ? (bodyTenantId ?? session.tenantId)
    : session.tenantId

  if (!tenantId) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenantId é obrigatório.' } }, { status: 400 })

  // Busca leads para calcular audienceCount
  const filters: Prisma.LeadWhereInput = {}
  if (audienceFilters) {
    try {
      const f = JSON.parse(typeof audienceFilters === 'string' ? audienceFilters : JSON.stringify(audienceFilters))
      if (f.status)    (filters as Record<string,unknown>).status      = f.status
      if (f.tenantId)  (filters as Record<string,unknown>).tenantId    = f.tenantId
      if (f.funnelStage) (filters as Record<string,unknown>).funnelStage = f.funnelStage
      if (f.daysSince) {
        (filters as Record<string,unknown>).createdAt = {
          gte: new Date(Date.now() - Number(f.daysSince) * 86400000),
        }
      }
    } catch { /* filtros inválidos, ignora */ }
  }
  if (!filters.tenantId) (filters as Record<string,unknown>).tenantId = tenantId

  const audienceCount = await prisma.lead.count({ where: filters })

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
      tenantId,
      templateName: templateName.trim(),
      templateVars: typeof templateVars === 'object' ? JSON.stringify(templateVars) : (templateVars ?? '{}'),
      templateLanguage: templateLanguage ?? 'pt_BR',
      audienceFilters: typeof audienceFilters === 'object' ? JSON.stringify(audienceFilters) : (audienceFilters ?? '{}'),
      audienceCount,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      createdById: session.userId,
    },
    include: {
      tenant: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json({ success: true, campaign }, { status: 201 })
}
